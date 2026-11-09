import { describe, expect, it } from 'vitest';
import { decimateKeepingBand } from '../../src/dsp/resample';

function sine(hz: number, sr: number, seconds: number): Float32Array {
  const x = new Float32Array(Math.round(sr * seconds));
  for (let i = 0; i < x.length; i++) x[i] = 0.5 * Math.sin((2 * Math.PI * hz * i) / sr);
  return x;
}
function rmsDb(x: Float32Array, skip: number): number {
  let e = 0;
  for (let i = skip; i < x.length - skip; i++) e += x[i] * x[i];
  return 10 * Math.log10(e / (x.length - 2 * skip));
}

describe('decimateKeepingBand', () => {
  it('returns the input unchanged for factor 1', () => {
    const x = sine(440, 16000, 0.1);
    expect(decimateKeepingBand(x, 1)).toBe(x);
  });
  it.each([[48000, 4], [44100, 4]])('keeps 0-5 kHz within 0.5 dB at %i Hz / %i', (sr, factor) => {
    for (const hz of [200, 2000, 4500, 5000]) {
      const x = sine(hz, sr, 0.5);
      const y = decimateKeepingBand(x, factor);
      expect(y.length).toBe(Math.floor(x.length / factor));
      expect(Math.abs(rmsDb(y, 200) - rmsDb(x, 800)), `${hz} Hz`).toBeLessThan(0.5);
    }
  });
  it.each([[48000, 4, 7500], [44100, 4, 6500]])('rejects content that would alias below 5 kHz (%i Hz / %i, %i Hz tone)', (sr, factor, hz) => {
    const x = sine(hz, sr, 0.5);
    expect(rmsDb(decimateKeepingBand(x, factor), 200) - rmsDb(x, 800)).toBeLessThan(-40);
  });
});
