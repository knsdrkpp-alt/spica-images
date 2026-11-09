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
