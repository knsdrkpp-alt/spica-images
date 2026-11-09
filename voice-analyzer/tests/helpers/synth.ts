export interface HarmonicToneOptions {
  f0: number;
  seconds: number;
  sampleRate: number;
  /** number of harmonics; default fills up to Nyquist (max 40) */
  harmonics?: number;
  /** spectral tilt of harmonic amplitudes; default -12 */
  tiltDbPerOctave?: number;
  /** noise level relative to the harmonic signal RMS, in dB; default none */
  noiseDb?: number;
  seed?: number;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Harmonic tone with optional seeded noise, peak-normalized to 0.8. */
export function harmonicTone(o: HarmonicToneOptions): Float32Array {
  const n = Math.round(o.seconds * o.sampleRate);
  const tilt = o.tiltDbPerOctave ?? -12;
  const maxByNyquist = Math.max(1, Math.floor(o.sampleRate / 2 / o.f0));
  const count = Math.min(o.harmonics ?? 40, maxByNyquist);
  const x = new Float64Array(n);
  for (let k = 1; k <= count; k++) {
    if (k * o.f0 >= o.sampleRate / 2) break;
    const amp = Math.pow(10, (tilt * Math.log2(k)) / 20);
    const w = (2 * Math.PI * k * o.f0) / o.sampleRate;
    for (let i = 0; i < n; i++) x[i] += amp * Math.sin(w * i);
  }
  if (o.noiseDb !== undefined && n > 0) {
    let e = 0;
    for (let i = 0; i < n; i++) e += x[i] * x[i];
    const rms = Math.sqrt(e / n);
    const sigma = rms * Math.pow(10, o.noiseDb / 20);
    const rnd = mulberry32(o.seed ?? 1);
    for (let i = 0; i < n; i++) {
      // Box-Muller
      const u = Math.max(rnd(), 1e-12);
      const v = rnd();
      x[i] += sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    }
  }
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(x[i]));
  const g = peak > 0 ? 0.8 / peak : 0;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = x[i] * g;
  return out;
}

export function silence(seconds: number, sampleRate: number): Float32Array {
  return new Float32Array(Math.round(seconds * sampleRate));
}
