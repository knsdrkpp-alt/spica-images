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

export type GateResult =
  | { ok: true; warnings: GateWarning[] }
  | { ok: false; reason: GateReason };

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
const SPEECH_WINDOW_DB = 35;
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

/** RMS (dBFS) over 10 ms frames within 35 dB of the loudest frame. */
function speechRmsDbfs(x: Float32Array, sampleRate: number): number {
  const frame = Math.max(1, Math.round(0.01 * sampleRate));
  const energies: number[] = [];
  for (let s = 0; s < x.length; s += frame) {
    const end = Math.min(x.length, s + frame);
    let e = 0;
    for (let i = s; i < end; i++) e += x[i] * x[i];
    energies.push(e / (end - s));
  }
  const maxDb = toDb(Math.max(0, ...energies));
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

  if (features.voicedSeconds < MIN_VOICED_SECONDS) return { ok: false, reason: 'no-voice' };

  const { peakDbfs, clipped } = peakAndClipping(samples);
  if (clipped) return { ok: false, reason: 'clipping' };
  if (peakDbfs < GATE.peakQuietDbfs) return { ok: false, reason: 'too-quiet' };

  const noiseDbfs = rmsDbfs(preRoll);
  const snrDb = speechRmsDbfs(samples, sampleRate) - noiseDbfs;
  if (snrDb < GATE.snrRejectDb) return { ok: false, reason: 'too-noisy' };

  if (task === 'vowel') {
    if (features.voicedSeconds < GATE.vowelStableMinSeconds) {
      return { ok: false, reason: 'vowel-too-short' };
    }
    // GATE.vowelLevelVarDbMax is not enforced in v1: no feature carries level variation.
    if (
      features.f0StabilitySt !== null &&
      features.f0StabilitySt * 100 > GATE.vowelFlatnessSdCentMax
    ) {
      return { ok: false, reason: 'vowel-unstable' };
    }
  } else if (features.voicedSeconds < GATE.vowelStableMinSeconds) {
    return { ok: false, reason: 'sentence-too-short' };
  }

  const warnings: GateWarning[] = [];
  if (snrDb < GATE.snrOkDb || noiseDbfs > GATE.noiseFloorMaxDbfs) warnings.push('noise-borderline');
  if (peakDbfs < GATE.peakTargetDbfs[0]) warnings.push('low-level');
  if (
    sampleRate >= 16000 &&
    highBandShare(samples, sampleRate) < BLUETOOTH_SHARE_MAX
  ) {
    warnings.push('bluetooth-band-limited');
  }
  if (processingOn) warnings.push('processing-on');
  return { ok: true, warnings };
}
