import { READING_MORAE } from '../diagnosis/config';
import type { PitchTrack, SentenceFeatures, TaskFeatures } from '../types';
import { hzToSemitone, trackPitch, voicedMask } from './pitch';
import { cpps, h1h2Db, hnrDb, stabilitySt } from './quality';
import {
  alphaRatioDb, bandShares, longTermSpectrum, spectralCentroidHz, spectrumCurveDb,
} from './spectrum';

const EDGE_SECONDS = 0.75;
const MIN_STABLE_SECONDS = 1.5 + 1;
const MIN_VOICED_FRAMES = 10;
const SPEECH_FLOOR_DB = 35;
const PAUSE_SECONDS = 0.25;
const ENERGY_HOP_SECONDS = 0.01;

function finiteOrNull(v: number | null): number | null {
  return v !== null && Number.isFinite(v) ? v : null;
}

function finiteOr(v: number, fallback: number): number {
  return Number.isFinite(v) ? v : fallback;
}

/** Linear-interpolated percentile of an ascending-sorted array, p in [0, 1]. */
function percentile(sorted: number[], p: number): number {
  const pos = p * (sorted.length - 1);
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function analyse(samples: Float32Array, sampleRate: number, removeSilence: boolean): TaskFeatures {
  const track: PitchTrack = trackPitch(samples, sampleRate);
  const voiced = track.f0.filter((v): v is number => v !== null);
  const enough = voiced.length >= MIN_VOICED_FRAMES;

  const spec = longTermSpectrum(samples, sampleRate, voicedMask(track, samples.length, sampleRate));
  const base: TaskFeatures = {
    f0MedianHz: null,
    f0RangeSt: null,
    f0StabilitySt: null,
    cpps: finiteOrNull(cpps(samples, sampleRate, { removeSilence })),
    hnrDb: null,
    h1h2Db: null,
    alphaRatioDb: finiteOr(alphaRatioDb(spec), 0),
    centroidHz: finiteOr(spectralCentroidHz(spec), 0),
    bandShare: bandShares(spec).map((v) => finiteOr(v, 0)),
    spectrumDb: spectrumCurveDb(spec),
    voicedSeconds: voiced.length * track.hopSeconds,
  };
  if (!enough) return base;

  const hz = [...voiced].sort((a, b) => a - b);
  const st = hz.map((v) => hzToSemitone(v));
  return {
    ...base,
    f0MedianHz: finiteOrNull(percentile(hz, 0.5)),
    f0RangeSt: finiteOrNull(percentile(st, 0.95) - percentile(st, 0.05)),
    f0StabilitySt: finiteOrNull(stabilitySt(track)),
    hnrDb: finiteOrNull(hnrDb(samples, sampleRate, track)),
    h1h2Db: finiteOrNull(h1h2Db(samples, sampleRate, track)),
  };
}

export function extractVowel(samples: Float32Array, sampleRate: number): TaskFeatures {
  const edge = Math.round(EDGE_SECONDS * sampleRate);
  const trim = samples.length / sampleRate >= MIN_STABLE_SECONDS;
  const segment = trim ? samples.subarray(edge, samples.length - edge) : samples;
  return analyse(segment, sampleRate, false);
}

/**
 * Seconds of speech: 10 ms frames within 35 dB of the loudest frame, minus every run of
 * quiet frames lasting at least 250 ms (pauses). Shorter quiet runs count as speech.
 */
export function speechSeconds(samples: Float32Array, sampleRate: number): number {
  const hop = Math.max(1, Math.round(ENERGY_HOP_SECONDS * sampleRate));
  const n = Math.floor(samples.length / hop);
  const rms = new Float64Array(n);
  let max = 0;
  for (let f = 0; f < n; f++) {
    let e = 0;
    for (let i = f * hop; i < (f + 1) * hop; i++) e += samples[i] * samples[i];
    rms[f] = Math.sqrt(e / hop);
    if (rms[f] > max) max = rms[f];
  }
  if (!(max > 0)) return 0;
  const threshold = max * Math.pow(10, -SPEECH_FLOOR_DB / 20);
  const minRun = Math.ceil(PAUSE_SECONDS / ENERGY_HOP_SECONDS - 1e-9);
  let counted = 0;
  let f = 0;
  while (f < n) {
    if (rms[f] >= threshold) {
      counted++;
      f++;
      continue;
    }
    let end = f;
    while (end < n && rms[end] < threshold) end++;
    if (end - f < minRun) counted += end - f;
    f = end;
  }
  return counted * (hop / sampleRate);
}

export function extractSentence(samples: Float32Array, sampleRate: number): SentenceFeatures {
  const base = analyse(samples, sampleRate, true);
  const total = samples.length / sampleRate;
  const speech = speechSeconds(samples, sampleRate);
  return {
    ...base,
    speakingRate: total > 0 && speech > 0 ? READING_MORAE / total : 0,
    articulationRate: speech > 0 ? READING_MORAE / speech : 0,
  };
}
