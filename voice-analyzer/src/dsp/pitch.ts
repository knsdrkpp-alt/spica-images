import { F0_RANGE_HZ, YIN_THRESHOLD } from '../diagnosis/config';
import type { PitchTrack } from '../types';
import { spectrumFrameLayout } from './spectrum';

const FRAME_SECONDS = 0.04;
const HOP_SECONDS = 0.01;
/** Without a candidate under YIN_THRESHOLD, the global minimum is voiced only below this. */
const FALLBACK_CMND = 0.3;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

interface FrameResult {
  f0: number | null;
  clarity: number;
}

function analyzeFrame(
  x: Float32Array,
  start: number,
  frameLen: number,
  sampleRate: number,
  tauMin: number,
  tauMax: number,
  cmnd: Float64Array,
): FrameResult {
  const w = frameLen - tauMax;
  // difference function + cumulative mean normalization
  let running = 0;
  cmnd[0] = 1;
  for (let tau = 1; tau <= tauMax; tau++) {
    let d = 0;
    for (let j = 0; j < w; j++) {
      const diff = x[start + j] - x[start + j + tau];
      d += diff * diff;
    }
    running += d;
    cmnd[tau] = running > 0 ? (d * tau) / running : 1;
  }
  if (!(running > 0)) return { f0: null, clarity: 0 };

  let tau = -1;
  for (let t = tauMin; t <= tauMax; t++) {
    if (cmnd[t] < YIN_THRESHOLD) {
      tau = t;
      while (tau + 1 <= tauMax && cmnd[tau + 1] < cmnd[tau]) tau++;
      break;
    }
  }
  if (tau < 0) {
    let best = tauMin;
    for (let t = tauMin + 1; t <= tauMax; t++) if (cmnd[t] < cmnd[best]) best = t;
    if (!(cmnd[best] < FALLBACK_CMND)) return { f0: null, clarity: clamp01(1 - cmnd[best]) };
    tau = best;
  }

  let refined = tau;
  if (tau > 1 && tau < tauMax) {
    const a = cmnd[tau - 1];
    const b = cmnd[tau];
    const c = cmnd[tau + 1];
    const den = a - 2 * b + c;
    if (den > 0) refined = tau + (a - c) / (2 * den);
  }
  const f0 = sampleRate / refined;
  if (!Number.isFinite(f0)) return { f0: null, clarity: 0 };
  return { f0, clarity: clamp01(1 - cmnd[tau]) };
}

function isOctave(ratio: number): boolean {
  return (ratio >= 1.8 && ratio <= 2.2) || (ratio >= 0.45 && ratio <= 0.55);
}

/** A voiced frame is dropped when it sits an octave away from every voiced neighbour it has. */
function rejectOctaveJumps(f0: Array<number | null>): Array<number | null> {
  return f0.map((v, i) => {
    if (v === null) return null;
    const prev = i > 0 ? f0[i - 1] : null;
    const next = i + 1 < f0.length ? f0[i + 1] : null;
    const neighbours = [prev, next].filter((n): n is number => n !== null);
    if (neighbours.length === 0) return v;
    return neighbours.every((n) => isOctave(v / n)) ? null : v;
  });
}

/** 5-point median over voiced values; windows never reach across null gaps. */
function medianSmooth(f0: Array<number | null>): Array<number | null> {
  return f0.map((v, i) => {
    if (v === null) return null;
    const win: number[] = [v];
    for (let k = 1; k <= 2; k++) {
      const p = f0[i - k];
      if (p === undefined || p === null) break;
      win.push(p);
    }
    for (let k = 1; k <= 2; k++) {
      const n = f0[i + k];
      if (n === undefined || n === null) break;
      win.push(n);
    }
    win.sort((a, b) => a - b);
    return win[Math.floor(win.length / 2)];
  });
}

export function trackPitch(samples: Float32Array, sampleRate: number): PitchTrack {
  const frameLen = Math.round(FRAME_SECONDS * sampleRate);
  const hop = Math.round(HOP_SECONDS * sampleRate);
  const tauMin = Math.max(2, Math.floor(sampleRate / F0_RANGE_HZ[1]));
  const tauMax = Math.ceil(sampleRate / F0_RANGE_HZ[0]);
  const frameCount =
    samples.length < frameLen || tauMax >= frameLen ? 0 : Math.floor((samples.length - frameLen) / hop) + 1;

  const cmnd = new Float64Array(tauMax + 2);
  const raw: Array<number | null> = [];
  const clarity: number[] = [];
  for (let i = 0; i < frameCount; i++) {
    const r = analyzeFrame(samples, i * hop, frameLen, sampleRate, tauMin, tauMax, cmnd);
    raw.push(r.f0);
    clarity.push(r.clarity);
  }
  return { hopSeconds: HOP_SECONDS, f0: medianSmooth(rejectOctaveJumps(raw)), clarity };
}

/**
 * One flag per spectrum frame (see spectrumFrameLayout / longTermSpectrum): voiced when the
 * majority of pitch frames covering the spectrum frame's center time are voiced.
 */
export function voicedMask(track: PitchTrack, totalSamples: number, sampleRate: number): boolean[] {
  const { frameLength, hop } = spectrumFrameLayout(sampleRate);
  const frameCount = totalSamples < frameLength ? 1 : Math.floor((totalSamples - frameLength) / hop) + 1;
  const pitchFrame = FRAME_SECONDS;
  const mask: boolean[] = [];
  for (let i = 0; i < frameCount; i++) {
    const center = (i * hop + frameLength / 2) / sampleRate;
    const first = Math.max(0, Math.ceil((center - pitchFrame) / track.hopSeconds - 1e-9));
    const last = Math.min(track.f0.length - 1, Math.floor(center / track.hopSeconds + 1e-9));
    let total = 0;
    let voiced = 0;
    for (let j = first; j <= last; j++) {
      total++;
      if (track.f0[j] !== null) voiced++;
    }
    mask.push(total > 0 && voiced * 2 > total);
  }
  return mask;
}

export function hzToSemitone(hz: number, refHz = 100): number {
  return 12 * Math.log2(hz / refHz);
}
