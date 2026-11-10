import { BAND_EDGES_HZ } from '../diagnosis/config';
import { fft } from './fft';

export interface Spectrum {
  freqs: Float32Array;
  power: Float32Array;
}

const EPS = 1e-12;

/** Smallest power of two strictly greater than n. */
function nextPow2(n: number): number {
  let p = 1;
  while (p <= n) p <<= 1;
  return p;
}

/** ~64-128 ms power-of-two frames (min 1024) with 50% overlap: 2048 @16 kHz, 4096 @44.1/48 kHz. */
export function spectrumFrameLayout(sampleRate: number): { frameLength: number; hop: number } {
  const frameLength = Math.max(1024, nextPow2(Math.round(0.064 * sampleRate)));
  return { frameLength, hop: frameLength / 2 };
}

/** Number of analysis frames longTermSpectrum uses for a signal (at least 1; short input is zero-padded). */
export function spectrumFrameCount(totalSamples: number, sampleRate: number): number {
  const { frameLength, hop } = spectrumFrameLayout(sampleRate);
  return totalSamples < frameLength ? 1 : Math.floor((totalSamples - frameLength) / hop) + 1;
}

/** Mean Hann-windowed power spectrum over (voiced) frames. */
export function longTermSpectrum(
  samples: Float32Array,
  sampleRate: number,
  voicedMask?: boolean[],
): Spectrum {
  const { frameLength, hop } = spectrumFrameLayout(sampleRate);
  const bins = frameLength / 2 + 1;
  const freqs = new Float32Array(bins);
  for (let k = 0; k < bins; k++) freqs[k] = (k * sampleRate) / frameLength;
  const power = new Float32Array(bins);

  const window = new Float32Array(frameLength);
  for (let i = 0; i < frameLength; i++) {
    window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / frameLength);
  }

  const frameCount = spectrumFrameCount(samples.length, sampleRate);
  const re = new Float32Array(frameLength);
  const im = new Float32Array(frameLength);
  let used = 0;
  for (let f = 0; f < frameCount; f++) {
    if (voicedMask && !voicedMask[f]) continue;
    const start = f * hop;
    for (let i = 0; i < frameLength; i++) {
      const s = start + i < samples.length ? samples[start + i] : 0;
      re[i] = s * window[i];
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 0; k < bins; k++) power[k] += re[k] * re[k] + im[k] * im[k];
    used++;
  }
  if (used > 0) for (let k = 0; k < bins; k++) power[k] /= used;
  return { freqs, power };
}

/** Power of each bin apportioned to [lo, hi) by overlap of the bin's frequency interval. */
function bandEnergyOverlap(spec: Spectrum, lo: number, hi: number): number {
  const n = spec.freqs.length;
  if (n < 2) return 0;
  const half = (spec.freqs[1] - spec.freqs[0]) / 2;
  let e = 0;
  for (let k = 0; k < n; k++) {
    const a = Math.max(lo, spec.freqs[k] - half);
    const b = Math.min(hi, spec.freqs[k] + half);
    if (b > a) e += (spec.power[k] * (b - a)) / (2 * half);
  }
  return e;
}

function bandEnergy(spec: Spectrum, lo: number, hi: number): number {
  let e = 0;
  for (let k = 0; k < spec.freqs.length; k++) {
    if (spec.freqs[k] >= lo && spec.freqs[k] < hi) e += spec.power[k];
  }
  return e;
}

/** 12 band shares summing to 1 (all zeros for silence). Bands at/above Nyquist get 0. */
export function bandShares(spec: Spectrum): number[] {
  const n = spec.freqs.length;
  const nyquist = n > 0 ? spec.freqs[n - 1] : 0;
  const raw: number[] = [];
  for (let b = 0; b < BAND_EDGES_HZ.length - 1; b++) {
    const lo = BAND_EDGES_HZ[b];
    raw.push(lo >= nyquist ? 0 : bandEnergyOverlap(spec, lo, BAND_EDGES_HZ[b + 1]));
  }
  const total = raw.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return raw.map(() => 0);
  return raw.map((v) => v / total);
}

/** Energy 1-5 kHz over 50 Hz-1 kHz, in dB. */
export function alphaRatioDb(spec: Spectrum): number {
  const high = bandEnergy(spec, 1000, 5000);
  const low = bandEnergy(spec, 50, 1000);
  return 10 * Math.log10((high + EPS) / (low + EPS));
}

/** Power-weighted mean frequency in Hz (0 for silence). */
export function spectralCentroidHz(spec: Spectrum): number {
  let num = 0;
  let den = 0;
  for (let k = 0; k < spec.freqs.length; k++) {
    num += spec.freqs[k] * spec.power[k];
    den += spec.power[k];
  }
  return den > 0 ? num / den : 0;
}

/** Floor value (dB) of the spectrum curve: silence, no voiced frames, or points above Nyquist. */
export const SPECTRUM_FLOOR_DB = -120;
/** Number of points of the spectrum curve (6 colours x 40 points). */
export const SPECTRUM_POINTS = 240;
export const SPECTRUM_LOW_HZ = 100;
export const SPECTRUM_HIGH_HZ = 8000;

/** Lower edge (Hz) of curve point i; i = SPECTRUM_POINTS gives the top edge (8 kHz). */
export function spectrumPointEdgeHz(i: number): number {
  return SPECTRUM_LOW_HZ * Math.pow(SPECTRUM_HIGH_HZ / SPECTRUM_LOW_HZ, i / SPECTRUM_POINTS);
}

/**
 * The long-term spectrum resampled to 240 log-spaced points (100 Hz to 8 kHz), in dB (10*log10 power).
 * A point narrower than a bin takes the power linearly interpolated at its geometric centre; a wider
 * point averages the bins' power by overlap. Points above Nyquist, and silence, give SPECTRUM_FLOOR_DB.
 */
export function spectrumCurveDb(spec: Spectrum): number[] {
  const n = spec.freqs.length;
  const out = new Array<number>(SPECTRUM_POINTS).fill(SPECTRUM_FLOOR_DB);
  if (n < 2) return out;
  const df = spec.freqs[1] - spec.freqs[0];
  const nyquist = spec.freqs[n - 1];
  const toDb = (p: number) => {
    const db = 10 * Math.log10(p);
    return Number.isFinite(db) ? Math.max(SPECTRUM_FLOOR_DB, db) : SPECTRUM_FLOOR_DB;
  };
  for (let i = 0; i < SPECTRUM_POINTS; i++) {
    const lo = spectrumPointEdgeHz(i);
    const hi = spectrumPointEdgeHz(i + 1);
    if (lo >= nyquist) continue;
    let p: number;
    if (hi - lo < df) {
      const pos = Math.sqrt(lo * hi) / df;
      const k = Math.min(n - 2, Math.floor(pos));
      const t = Math.min(1, pos - k);
      p = spec.power[k] * (1 - t) + spec.power[k + 1] * t;
    } else {
      p = bandEnergyOverlap(spec, lo, hi) / ((Math.min(hi, nyquist + df / 2) - lo) / df);
    }
    out[i] = toDb(p);
  }
  return out;
}
