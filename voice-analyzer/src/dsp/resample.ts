/**
 * Integer-factor decimation for analyses that only need a band below some frequency.
 *
 * Blackman-windowed sinc low-pass with its cutoff at the new Nyquist (0.5 / factor cycles per input
 * sample) and `halfTapsPerFactor · factor` taps on each side, then every `factor`-th sample is kept.
 * Content between the new Nyquist and (newRate - keepHz) aliases above keepHz, outside the band of
 * interest; the filter only has to reject content above newRate - keepHz.
 * (pitch.ts keeps its own, narrower filter; it is deliberately not shared to leave F0 unchanged.)
 */
export function decimateKeepingBand(x: Float32Array, factor: number, halfTapsPerFactor = 30): Float32Array {
  if (factor <= 1) return x;
  const half = halfTapsPerFactor * factor;
  const fc = 0.5 / factor;
  const taps = new Float64Array(2 * half + 1);
  let sum = 0;
  for (let k = -half; k <= half; k++) {
    const sinc = k === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * k) / (Math.PI * k);
    const u = (Math.PI * k) / (half + 1);
    taps[k + half] = sinc * (0.42 + 0.5 * Math.cos(u) + 0.08 * Math.cos(2 * u));
    sum += taps[k + half];
  }
  for (let k = 0; k < taps.length; k++) taps[k] /= sum;
  const out = new Float32Array(Math.floor(x.length / factor));
  for (let i = 0; i < out.length; i++) {
    const c = i * factor;
    const k0 = Math.max(-half, -c);
    const k1 = Math.min(half, x.length - 1 - c);
    let acc = 0;
    for (let k = k0; k <= k1; k++) acc += taps[k + half] * x[c + k];
    out[i] = acc;
  }
  return out;
}
