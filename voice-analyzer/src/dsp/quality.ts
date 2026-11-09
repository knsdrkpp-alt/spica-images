/**
 * Voice clarity measures: CPPS, HNR, H1-H2 and pitch stability.
 *
 * PROVISIONAL: parameters follow the task brief and the Praat recipes as remembered (the Praat
 * manual was not reachable while writing this). Task 13 validates against Parselmouth.
 *
 * CPPS (after Praat `To PowerCepstrogram` + `Get CPPS`, Hillenbrand-style trend line)
 *   - pre-emphasis: first order, from 50 Hz (y[n] = x[n] - a·x[n-1], a = exp(-2π·50/fs))  [Praat default 50 Hz]
 *   - frames: Hann window, 40 ms, hop 10 ms (brief). Praat uses a Gaussian window and a 2 ms
 *     time step by default; this differs on purpose (brief) and is UNVERIFIED in effect.
 *   - spectrum: 10·log10(|X|²), FFT zero-padded to 2× the next power of two, linearly
 *     interpolated onto a fixed grid of 513 points over 0 .. 5000 Hz (or 0 .. fs/2 if lower).
 *     This acts like Praat's resampling to 2 × 5000 Hz and makes the cepstrum sample-rate
 *     independent; quefrency step = 1 / (2·5000) s = 0.1 ms.
 *   - cepstrum: inverse FFT of the symmetric dB spectrum (1024 points), power cepstrum c².
 *   - smoothing (on linear c² values): time ±1 frame (≈ 20 ms window at 10 ms hop, over kept
 *     frames only) then quefrency ±2 bins (0.5 ms window). [Praat defaults 0.02 s / 0.0005 s;
 *     whether Praat smooths linear or dB values is UNVERIFIED]
 *   - trend: ordinary least-squares straight line of cepstrum dB vs quefrency over
 *     1 ms .. 50 ms. [Praat default range 0.001-0.05 s; Praat's newer default fit method is
 *     "Robust", which is UNVERIFIED here]
 *   - peak: maximum within quefrency 1/500 .. 1/60 s (brief; Praat default 60-330 Hz),
 *     parabolic interpolation in dB; CPP = peak dB - trend dB at the peak quefrency.
 *   - CPPS = mean CPP over frames. With `removeSilence`, frames whose RMS is more than 35 dB
 *     below the loudest frame are dropped before smoothing and averaging.
 *   - returns null when no full frame exists or the loudest frame is below -100 dBFS RMS.
 *
 * HNR (after Praat `To Harmonicity (cc)`)
 *   - per voiced pitch frame (40 ms starting at i·hopSeconds, frame mean removed): normalized
 *     cross-correlation r(τ) = Σx[n]x[n+τ] / sqrt(Σx[n]² Σx[n+τ]²) at the integer lags around
 *     τ = fs/F0 (±1 sample beyond floor/ceil), max with parabolic refinement, r clamped to
 *     [1e-6, 1-1e-6], HNR = 10·log10(r/(1-r)); result = median over voiced frames.
 *     (Praat's cc method searches the lag itself and uses its own window; UNVERIFIED.)
 *   - null with fewer than 10 usable voiced frames. Clamp caps HNR at 60 dB.
 *
 * H1-H2 (uncorrected)
 *   - per voiced frame: 40 ms Hann window, FFT zero-padded to 2× next power of two, dB
 *     magnitude; H1 = max within F0 ± 10 %, H2 = max within 2·F0 ± 10 %, each refined by
 *     parabolic interpolation in dB; result = median of H1-H2 over voiced frames.
 *   - null with fewer than 10 usable voiced frames.
 *
 * Stability: population SD of hzToSemitone(F0) over voiced frames; null with fewer than 10.
 */
import type { PitchTrack } from '../types';
import { fft } from './fft';
import { hzToSemitone } from './pitch';

const FRAME_SECONDS = 0.04;
const HOP_SECONDS = 0.01;
const MIN_VOICED_FRAMES = 10;

const PRE_EMPHASIS_HZ = 50;
const CEPSTRUM_MAX_HZ = 5000;
/** Points of the one-sided dB spectrum grid (0 .. max frequency inclusive) = GRID_HALF + 1. */
const GRID_HALF = 512;
const PEAK_QUEFRENCY_S: [number, number] = [1 / 500, 1 / 60];
const TREND_QUEFRENCY_S: [number, number] = [0.001, 0.05];
const TIME_SMOOTH_FRAMES = 1;
const QUEFRENCY_SMOOTH_BINS = 2;
const SILENCE_DROP_DB = 35;
/** -100 dBFS RMS as mean square. */
const DIGITAL_SILENCE_MEAN_SQUARE = 1e-10;
const POWER_FLOOR = 1e-30;

const R_CLAMP = 1e-6;
const HARMONIC_SEARCH = 0.1;

function nextPow2(n: number): number {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

function hann(n: number): Float32Array {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
  return w;
}

function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Vertex of the parabola through (−1,a), (0,b), (1,c): offset in [-0.5, 0.5] and value. */
function parabolic(a: number, b: number, c: number): { offset: number; value: number } {
  const den = a - 2 * b + c;
  if (!(den < 0)) return { offset: 0, value: b };
  const offset = Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / den));
  return { offset, value: b - 0.25 * (a - c) * offset };
}

export function cpps(
  samples: Float32Array,
  sampleRate: number,
  opts: { removeSilence?: boolean } = {},
): number | null {
  const frameLen = Math.round(FRAME_SECONDS * sampleRate);
  const hop = Math.round(HOP_SECONDS * sampleRate);
  if (frameLen < 2 || samples.length < frameLen) return null;
  const frameCount = Math.floor((samples.length - frameLen) / hop) + 1;

  // frame energies on the raw signal
  const meanSquare = new Float64Array(frameCount);
  let maxMs = 0;
  for (let f = 0; f < frameCount; f++) {
    let e = 0;
    const s0 = f * hop;
    for (let j = 0; j < frameLen; j++) e += samples[s0 + j] * samples[s0 + j];
    meanSquare[f] = e / frameLen;
    if (meanSquare[f] > maxMs) maxMs = meanSquare[f];
  }
  if (!(maxMs >= DIGITAL_SILENCE_MEAN_SQUARE)) return null;
  const minMs = opts.removeSilence ? maxMs * Math.pow(10, -SILENCE_DROP_DB / 10) : -1;
  const kept: boolean[] = Array.from(meanSquare, (m) => m >= minMs);

  // pre-emphasis
  const a = Math.exp((-2 * Math.PI * PRE_EMPHASIS_HZ) / sampleRate);
  const x = new Float32Array(samples.length);
  x[0] = samples[0];
  for (let i = 1; i < samples.length; i++) x[i] = samples[i] - a * samples[i - 1];

  const win = hann(frameLen);
  const nfft = 2 * nextPow2(frameLen);
  const binHz = sampleRate / nfft;
  const maxHz = Math.min(CEPSTRUM_MAX_HZ, sampleRate / 2);
  const gridHz = maxHz / GRID_HALF;
  const nCep = 2 * GRID_HALF;
  const dq = 1 / (2 * maxHz);
  const halfCep = GRID_HALF; // quefrency bins 0 .. GRID_HALF
  const topBin = Math.min(nfft / 2, Math.ceil(maxHz / binHz) + 1);

  const re = new Float32Array(nfft);
  const im = new Float32Array(nfft);
  const db = new Float64Array(topBin + 1);
  const cre = new Float32Array(nCep);
  const cim = new Float32Array(nCep);
  // power cepstra (linear c²) of kept frames; null for dropped frames
  const cep: Array<Float64Array | null> = new Array(frameCount).fill(null);

  for (let f = 0; f < frameCount; f++) {
    if (!kept[f]) continue;
    re.fill(0);
    im.fill(0);
    const s0 = f * hop;
    for (let j = 0; j < frameLen; j++) re[j] = x[s0 + j] * win[j];
    fft(re, im);
    for (let k = 0; k <= topBin; k++) db[k] = 10 * Math.log10(re[k] * re[k] + im[k] * im[k] + POWER_FLOOR);
    for (let g = 0; g <= GRID_HALF; g++) {
      const pos = (g * gridHz) / binHz;
      const k0 = Math.min(Math.floor(pos), topBin - 1);
      const t = pos - k0;
      const v = db[k0] * (1 - t) + db[k0 + 1] * t;
      cre[g] = v;
      if (g > 0 && g < GRID_HALF) cre[nCep - g] = v;
    }
    cim.fill(0);
    fft(cre, cim); // real, even input: forward FFT = nCep · inverse FFT
    const p = new Float64Array(halfCep + 1);
    for (let q = 0; q <= halfCep; q++) {
      const c = cre[q] / nCep;
      p[q] = c * c;
    }
    cep[f] = p;
  }

  const peakLo = Math.max(1, Math.ceil(PEAK_QUEFRENCY_S[0] / dq));
  const peakHi = Math.min(halfCep - 1, Math.floor(PEAK_QUEFRENCY_S[1] / dq));
  const trendLo = Math.max(1, Math.ceil(TREND_QUEFRENCY_S[0] / dq));
  const trendHi = Math.min(halfCep, Math.floor(TREND_QUEFRENCY_S[1] / dq));

  const timeAvg = new Float64Array(halfCep + 1);
  const smooth = new Float64Array(halfCep + 1);
  let sum = 0;
  let count = 0;
  for (let f = 0; f < frameCount; f++) {
    if (!cep[f]) continue;
    timeAvg.fill(0);
    let n = 0;
    for (let d = -TIME_SMOOTH_FRAMES; d <= TIME_SMOOTH_FRAMES; d++) {
      const c = cep[f + d];
      if (!c) continue;
      for (let q = 0; q <= halfCep; q++) timeAvg[q] += c[q];
      n++;
    }
    for (let q = 0; q <= halfCep; q++) {
      let s = 0;
      let m = 0;
      for (let d = -QUEFRENCY_SMOOTH_BINS; d <= QUEFRENCY_SMOOTH_BINS; d++) {
        const qq = q + d;
        if (qq < 0 || qq > halfCep) continue;
        s += timeAvg[qq];
        m++;
      }
      smooth[q] = 10 * Math.log10(s / (m * n) + POWER_FLOOR);
    }
    // least-squares trend line over the trend range
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    const nt = trendHi - trendLo + 1;
    for (let q = trendLo; q <= trendHi; q++) {
      const qs = q * dq;
      sx += qs;
      sy += smooth[q];
      sxx += qs * qs;
      sxy += qs * smooth[q];
    }
    const slope = (nt * sxy - sx * sy) / (nt * sxx - sx * sx);
    const intercept = (sy - slope * sx) / nt;
    let best = peakLo;
    for (let q = peakLo + 1; q <= peakHi; q++) if (smooth[q] > smooth[best]) best = q;
    const pk = parabolic(smooth[best - 1], smooth[best], smooth[best + 1]);
    const cpp = pk.value - (intercept + slope * (best + pk.offset) * dq);
    if (Number.isFinite(cpp)) {
      sum += cpp;
      count++;
    }
  }
  return count > 0 ? sum / count : null;
}

/** Start sample and length of pitch frame i, or null if it runs past the end. */
function pitchFrame(i: number, track: PitchTrack, sampleRate: number, total: number): [number, number] | null {
  const start = Math.round(i * track.hopSeconds * sampleRate);
  const len = Math.round(FRAME_SECONDS * sampleRate);
  return start + len <= total ? [start, len] : null;
}

function normalizedCorrelation(x: Float64Array, lag: number): number {
  let xy = 0, xx = 0, yy = 0;
  for (let n = 0; n + lag < x.length; n++) {
    xy += x[n] * x[n + lag];
    xx += x[n] * x[n];
    yy += x[n + lag] * x[n + lag];
  }
  const den = Math.sqrt(xx * yy);
  return den > 0 ? xy / den : 0;
}

export function hnrDb(samples: Float32Array, sampleRate: number, track: PitchTrack): number | null {
  const values: number[] = [];
  for (let i = 0; i < track.f0.length; i++) {
    const f0 = track.f0[i];
    if (f0 === null || !(f0 > 0)) continue;
    const fr = pitchFrame(i, track, sampleRate, samples.length);
    if (!fr) continue;
    const [start, len] = fr;
    const x = new Float64Array(len);
    let mean = 0;
    for (let j = 0; j < len; j++) mean += samples[start + j];
    mean /= len;
    for (let j = 0; j < len; j++) x[j] = samples[start + j] - mean;
    const period = sampleRate / f0;
    const lo = Math.max(1, Math.floor(period) - 1);
    const hi = Math.min(len - 2, Math.ceil(period) + 1);
    if (hi < lo) continue;
    const r: number[] = [];
    for (let lag = lo; lag <= hi; lag++) r.push(normalizedCorrelation(x, lag));
    let b = 0;
    for (let k = 1; k < r.length; k++) if (r[k] > r[b]) b = k;
    let peak = r[b];
    if (b > 0 && b < r.length - 1) peak = parabolic(r[b - 1], r[b], r[b + 1]).value;
    const rc = Math.min(1 - R_CLAMP, Math.max(R_CLAMP, peak));
    values.push(10 * Math.log10(rc / (1 - rc)));
  }
  return values.length >= MIN_VOICED_FRAMES ? median(values) : null;
}

export function h1h2Db(samples: Float32Array, sampleRate: number, track: PitchTrack): number | null {
  const len = Math.round(FRAME_SECONDS * sampleRate);
  const nfft = 2 * nextPow2(len);
  const binHz = sampleRate / nfft;
  const win = hann(len);
  const re = new Float32Array(nfft);
  const im = new Float32Array(nfft);
  const db = new Float64Array(nfft / 2 + 1);

  const harmonicDb = (hz: number): number | null => {
    const lo = Math.max(1, Math.floor((hz * (1 - HARMONIC_SEARCH)) / binHz));
    const hi = Math.min(nfft / 2 - 1, Math.ceil((hz * (1 + HARMONIC_SEARCH)) / binHz));
    if (hi < lo) return null;
    let b = lo;
    for (let k = lo + 1; k <= hi; k++) if (db[k] > db[b]) b = k;
    return parabolic(db[b - 1], db[b], db[b + 1]).value;
  };

  const values: number[] = [];
  for (let i = 0; i < track.f0.length; i++) {
    const f0 = track.f0[i];
    if (f0 === null || !(f0 > 0) || 2 * f0 * (1 + HARMONIC_SEARCH) >= sampleRate / 2) continue;
    const fr = pitchFrame(i, track, sampleRate, samples.length);
    if (!fr) continue;
    const start = fr[0];
    re.fill(0);
    im.fill(0);
    for (let j = 0; j < len; j++) re[j] = samples[start + j] * win[j];
    fft(re, im);
    let energy = 0;
    for (let k = 0; k <= nfft / 2; k++) {
      const pw = re[k] * re[k] + im[k] * im[k];
      energy += pw;
      db[k] = 10 * Math.log10(pw + POWER_FLOOR);
    }
    if (!(energy > 0)) continue;
    const h1 = harmonicDb(f0);
    const h2 = harmonicDb(2 * f0);
    if (h1 === null || h2 === null) continue;
    const d = h1 - h2;
    if (Number.isFinite(d)) values.push(d);
  }
  return values.length >= MIN_VOICED_FRAMES ? median(values) : null;
}

export function stabilitySt(track: PitchTrack): number | null {
  const st: number[] = [];
  for (const f of track.f0) if (f !== null && f > 0) st.push(hzToSemitone(f));
  if (st.length < MIN_VOICED_FRAMES) return null;
  const mean = st.reduce((s, v) => s + v, 0) / st.length;
  const variance = st.reduce((s, v) => s + (v - mean) * (v - mean), 0) / st.length;
  return Math.sqrt(variance);
}
