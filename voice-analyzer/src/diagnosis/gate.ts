import { longTermSpectrum } from '../dsp/spectrum';
import type { TaskFeatures } from '../types';
import { GATE } from './config';

export type GateReason =
  | 'too-noisy'
  | 'clipping'
  | 'too-quiet'
  | 'no-voice'
  | 'vowel-too-short'
  | 'vowel-unstable'
  | 'sentence-too-short';

export type GateWarning =
  | 'noise-borderline'
  | 'low-level'
  | 'bluetooth-band-limited'
  | 'processing-on';

/** Measured levels behind a gate decision (for on-screen diagnostics and later calibration). */
export interface GateDetail {
  /** Speech minus pre-roll level in dB; null when there is no pre-roll. */
  snrDb: number | null;
  /** Pre-roll level (dBFS) after DC removal and the 80 Hz high-pass; null when there is no pre-roll. */
  noiseFloorDbfs: number | null;
  /** Speech level (dBFS) used for the SNR. */
  speechDbfs: number;
  /** Peak level (dBFS) of the recording. */
  peakDbfs: number;
}

export type GateResult =
  | { ok: true; warnings: GateWarning[]; detail: GateDetail }
  | { ok: false; reason: GateReason; detail: GateDetail };

export interface GateInput {
  samples: Float32Array;
  sampleRate: number;
  preRoll: Float32Array;
  task: 'vowel' | 'sentence';
  features: TaskFeatures;
  processingOn: boolean;
}

const FLOOR_DBFS = -120;
const CLIP_LEVEL = 0.99;
const MIN_VOICED_SECONDS = 0.3;
const SPEECH_WINDOW_DB = 20;
const SNR_HIGHPASS_HZ = 80;
const BLUETOOTH_CUTOFF_HZ = 4000;
const BLUETOOTH_SHARE_MAX = 0.001;

const toDb = (power: number): number =>
  power > 0 ? Math.max(FLOOR_DBFS, 10 * Math.log10(power)) : FLOOR_DBFS;

function rmsDbfs(x: Float32Array): number {
  if (x.length === 0) return FLOOR_DBFS;
  let e = 0;
  for (let i = 0; i < x.length; i++) e += x[i] * x[i];
  return toDb(e / x.length);
}

/**
 * For the SNR estimate only: subtract the mean, then apply an 80 Hz 2nd-order Butterworth
 * high-pass (RBJ biquad), so DC offset and low-frequency rumble do not count as room noise.
 */
function dcBlockHighpass(x: Float32Array, sampleRate: number): Float32Array {
  const out = new Float32Array(x.length);
  if (x.length === 0) return out;
  let mean = 0;
  for (let i = 0; i < x.length; i++) mean += x[i];
  mean /= x.length;
  const w0 = (2 * Math.PI * SNR_HIGHPASS_HZ) / sampleRate;
  const alpha = Math.sin(w0) / (2 * Math.SQRT1_2);
  const cosw = Math.cos(w0);
  const a0 = 1 + alpha;
  const b0 = (1 + cosw) / 2 / a0;
  const b1 = -(1 + cosw) / a0;
  const b2 = b0;
  const a1 = (-2 * cosw) / a0;
  const a2 = (1 - alpha) / a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const xi = x[i] - mean;
    const y = b0 * xi + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    out[i] = y;
    x2 = x1; x1 = xi; y2 = y1; y1 = y;
  }
  return out;
}

/** RMS (dBFS) over 10 ms frames within 20 dB of the loudest frame. */
function speechRmsDbfs(x: Float32Array, sampleRate: number): number {
  const frame = Math.max(1, Math.round(0.01 * sampleRate));
  const energies: number[] = [];
  for (let s = 0; s < x.length; s += frame) {
    const end = Math.min(x.length, s + frame);
    let e = 0;
    for (let i = s; i < end; i++) e += x[i] * x[i];
    energies.push(e / (end - s));
  }
  let maxE = 0;
  for (const e of energies) if (e > maxE) maxE = e;
  const maxDb = toDb(maxE);
  if (maxDb <= FLOOR_DBFS) return FLOOR_DBFS;
  let sum = 0;
  let n = 0;
  for (const e of energies) {
    if (toDb(e) >= maxDb - SPEECH_WINDOW_DB) {
      sum += e;
      n++;
    }
  }
  return toDb(sum / n);
}

function peakAndClipping(x: Float32Array): { peakDbfs: number; clipped: boolean } {
  let peak = 0;
  let clipCount = 0;
  let run = 0;
  let maxRun = 0;
  for (let i = 0; i < x.length; i++) {
    const a = Math.abs(x[i]);
    if (a > peak) peak = a;
    if (a >= CLIP_LEVEL) {
      clipCount++;
      run++;
      if (run > maxRun) maxRun = run;
    } else {
      run = 0;
    }
  }
  const clipped =
    x.length > 0 && (clipCount / x.length > GATE.clipRatioMax || maxRun >= GATE.clipRunMax);
  return { peakDbfs: toDb(peak * peak), clipped };
}

function highBandShare(samples: Float32Array, sampleRate: number): number {
  const { freqs, power } = longTermSpectrum(samples, sampleRate);
  let total = 0;
  let high = 0;
  for (let k = 0; k < freqs.length; k++) {
    total += power[k];
    if (freqs[k] >= BLUETOOTH_CUTOFF_HZ) high += power[k];
  }
  return total > 0 ? high / total : 1;
}

export function checkGate(input: GateInput): GateResult {
  const { samples, sampleRate, preRoll, task, features, processingOn } = input;

  const { peakDbfs, clipped } = peakAndClipping(samples);
  // A missing/empty preRoll means the SNR is unknown: skip the SNR reject and warn instead.
  const snrKnown = preRoll.length > 0;
  const speechDbfs = speechRmsDbfs(dcBlockHighpass(samples, sampleRate), sampleRate);
  const noiseDbfs = snrKnown ? rmsDbfs(dcBlockHighpass(preRoll, sampleRate)) : Number.NaN;
  const snrDb = snrKnown ? speechDbfs - noiseDbfs : Number.NaN;
  const detail: GateDetail = {
    snrDb: snrKnown ? snrDb : null,
    noiseFloorDbfs: snrKnown ? noiseDbfs : null,
    speechDbfs,
    peakDbfs,
  };
  const reject = (reason: GateReason): GateResult => ({ ok: false, reason, detail });

  if (features.voicedSeconds < MIN_VOICED_SECONDS) return reject('no-voice');
  if (clipped) return reject('clipping');
  if (peakDbfs < GATE.peakQuietDbfs) return reject('too-quiet');
  if (snrKnown && snrDb < GATE.snrRejectDb) return reject('too-noisy');

  if (task === 'vowel') {
    if (features.voicedSeconds < GATE.vowelStableMinSeconds) {
      return reject('vowel-too-short');
    }
    // GATE.vowelLevelVarDbMax is not enforced in v1: no feature carries level variation.
    if (
      features.f0StabilitySt !== null &&
      features.f0StabilitySt * 100 > GATE.vowelFlatnessSdCentMax
    ) {
      return reject('vowel-unstable');
    }
  } else if (features.voicedSeconds < GATE.vowelStableMinSeconds) {
    return reject('sentence-too-short');
  }

  const warnings: GateWarning[] = [];
  if (!snrKnown || snrDb < GATE.snrOkDb || noiseDbfs > GATE.noiseFloorMaxDbfs) warnings.push('noise-borderline');
  if (peakDbfs < GATE.peakTargetDbfs[0]) warnings.push('low-level');
  // Sentences only: a sustained vowel is naturally low-passed, so this check would false-alarm on it,
  // whereas real speech (fricatives, bursts) has energy above 4 kHz.
  if (
    task === 'sentence' &&
    sampleRate >= 16000 &&
    highBandShare(samples, sampleRate) < BLUETOOTH_SHARE_MAX
  ) {
    warnings.push('bluetooth-band-limited');
  }
  if (processingOn) warnings.push('processing-on');
  return { ok: true, warnings, detail };
}
