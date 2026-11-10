import { describe, it, expect } from 'vitest';
import { harmonicTone, silence } from '../helpers/synth';
import {
  longTermSpectrum,
  bandShares,
  alphaRatioDb,
  spectralCentroidHz,
  spectrumFrameLayout,
  spectrumCurveDb,
  SPECTRUM_FLOOR_DB,
  SPECTRUM_POINTS,
} from '../../src/dsp/spectrum';
import { fft } from '../../src/dsp/fft';

const argmax = (a: number[]) => a.indexOf(Math.max(...a));

describe('fft', () => {
  it('puts a bin-aligned sinusoid in the right bin', () => {
    const n = 64;
    const re = new Float32Array(n);
    const im = new Float32Array(n);
    for (let i = 0; i < n; i++) re[i] = Math.cos((2 * Math.PI * 5 * i) / n);
    fft(re, im);
    expect(re[5]).toBeCloseTo(n / 2, 3);
    expect(Math.abs(re[7])).toBeLessThan(1e-3);
  });
  it('throws for non power-of-two length', () => {
    expect(() => fft(new Float32Array(6), new Float32Array(6))).toThrow();
  });
});

describe('spectrumFrameLayout', () => {
  it('uses 64 ms+ power-of-two frames with 50% hop', () => {
    expect(spectrumFrameLayout(16000)).toEqual({ frameLength: 2048, hop: 1024 });
    expect(spectrumFrameLayout(44100)).toEqual({ frameLength: 4096, hop: 2048 });
    expect(spectrumFrameLayout(48000)).toEqual({ frameLength: 4096, hop: 2048 });
    expect(spectrumFrameLayout(8000).frameLength).toBe(1024);
  });
});

describe('spectrum', () => {
  it('1 kHz tone peaks in band index 6', () => {
    const x = harmonicTone({ f0: 1000, seconds: 1, sampleRate: 16000, harmonics: 1 });
    const shares = bandShares(longTermSpectrum(x, 16000));
    expect(shares).toHaveLength(12);
    expect(argmax(shares)).toBe(6);
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });

  it('peak band is the same across sample rates', () => {
    const idx = [16000, 44100, 48000].map((sr) => {
      const x = harmonicTone({ f0: 1000, seconds: 1, sampleRate: sr, harmonics: 1 });
      return argmax(bandShares(longTermSpectrum(x, sr)));
    });
    expect(idx).toEqual([6, 6, 6]);
  });

  it('centroid and alpha ratio are consistent across sample rates', () => {
    // Same harmonic signal; differences come only from FFT bin resolution
    // and edge effects, so loose tolerances (15% / 3 dB) are enough.
    const rates = [16000, 44100, 48000];
    const specs = rates.map((sr) =>
      longTermSpectrum(harmonicTone({ f0: 150, seconds: 1, sampleRate: sr }), sr),
    );
    const cs = specs.map(spectralCentroidHz);
    const as = specs.map(alphaRatioDb);
    for (let i = 1; i < rates.length; i++) {
      expect(Math.abs(cs[i] - cs[0]) / cs[0]).toBeLessThan(0.15);
      expect(Math.abs(as[i] - as[0])).toBeLessThan(3);
    }
  });

  it('steeper tilt gives lower alpha ratio', () => {
    const sr = 16000;
    const steep = harmonicTone({ f0: 150, seconds: 1, sampleRate: sr, tiltDbPerOctave: -12 });
    const flat = harmonicTone({ f0: 150, seconds: 1, sampleRate: sr, tiltDbPerOctave: -3 });
    expect(alphaRatioDb(longTermSpectrum(steep, sr))).toBeLessThan(
      alphaRatioDb(longTermSpectrum(flat, sr)),
    );
  });

  it('centroid of 200 Hz tone is about 200 Hz', () => {
    const x = harmonicTone({ f0: 200, seconds: 1, sampleRate: 16000, harmonics: 1 });
    expect(Math.abs(spectralCentroidHz(longTermSpectrum(x, 16000)) - 200)).toBeLessThan(10);
  });

  it('voicedMask selects frames', () => {
    const sr = 16000;
    const { frameLength, hop } = spectrumFrameLayout(sr);
    const lo = harmonicTone({ f0: 300, seconds: 0.5, sampleRate: sr, harmonics: 1 });
    const hi = harmonicTone({ f0: 1000, seconds: 0.5, sampleRate: sr, harmonics: 1 });
    const x = new Float32Array(lo.length + hi.length);
    x.set(lo, 0);
    x.set(hi, lo.length);
    const nFrames = Math.floor((x.length - frameLength) / hop) + 1;
    const first = Array.from({ length: nFrames }, (_, i) => i * hop + frameLength <= lo.length);
    const second = Array.from({ length: nFrames }, (_, i) => i * hop >= lo.length);
    expect(first.some(Boolean)).toBe(true);
    expect(second.some(Boolean)).toBe(true);
    const cLo = spectralCentroidHz(longTermSpectrum(x, sr, first));
    const cHi = spectralCentroidHz(longTermSpectrum(x, sr, second));
    const cAll = spectralCentroidHz(longTermSpectrum(x, sr));
    expect(Math.abs(cLo - 300)).toBeLessThan(15);
    expect(Math.abs(cHi - 1000)).toBeLessThan(30);
    expect(cAll).toBeGreaterThan(cLo + 50);
    expect(cAll).toBeLessThan(cHi - 50);
    const none = longTermSpectrum(x, sr, new Array(nFrames).fill(false));
    expect(none.power.every((v) => v === 0)).toBe(true);
  });

  it('is finite for silence, short input and empty mask', () => {
    const sr = 16000;
    const s = longTermSpectrum(silence(0.5, sr), sr);
    expect(bandShares(s)).toEqual(new Array(12).fill(0));
    expect(Number.isFinite(alphaRatioDb(s))).toBe(true);
    expect(spectralCentroidHz(s)).toBe(0);
    const short = longTermSpectrum(new Float32Array(100).fill(0.1), sr);
    expect(short.power.length).toBe(spectrumFrameLayout(sr).frameLength / 2 + 1);
    const none = longTermSpectrum(harmonicTone({ f0: 200, seconds: 0.5, sampleRate: sr }), sr, [false]);
    expect(none.power.every((v) => v === 0)).toBe(true);
  });

  it('apportions a tone on a band edge evenly between the two bands', () => {
    const sr = 16000;
    const x = harmonicTone({ f0: 208, seconds: 2, sampleRate: sr, harmonics: 1 });
    const shares = bandShares(longTermSpectrum(x, sr));
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    expect(Math.abs(shares[1] - shares[2])).toBeLessThan(0.1);
    expect(shares[1] + shares[2]).toBeGreaterThan(0.9);
  });

  it('zeros bands above Nyquist and renormalizes', () => {
    const sr = 8000; // Nyquist 4000: band 11 starts at 5563 Hz (above Nyquist) so it must be 0
    const x = harmonicTone({ f0: 1000, seconds: 1, sampleRate: sr, harmonics: 1 });
    const shares = bandShares(longTermSpectrum(x, sr));
    expect(shares[11]).toBe(0);
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });
});

describe('spectrumFrameCount', () => {
  it('is 1 for empty/short input and counts hops otherwise', async () => {
    const { spectrumFrameCount, spectrumFrameLayout } = await import('../../src/dsp/spectrum');
    const { frameLength, hop } = spectrumFrameLayout(16000);
    expect(spectrumFrameCount(0, 16000)).toBe(1);
    expect(spectrumFrameCount(frameLength - 1, 16000)).toBe(1);
    expect(spectrumFrameCount(frameLength, 16000)).toBe(1);
    expect(spectrumFrameCount(frameLength + hop, 16000)).toBe(2);
    expect(spectrumFrameCount(16000, 16000)).toBe(Math.floor((16000 - frameLength) / hop) + 1);
  });
});

describe('spectrumCurveDb', () => {
  const peakIdx = Math.round((240 * Math.log(1000 / 100)) / Math.log(80));
  it('has 240 finite points', () => {
    const x = harmonicTone({ f0: 150, seconds: 1, sampleRate: 16000 });
    const c = spectrumCurveDb(longTermSpectrum(x, 16000));
    expect(c).toHaveLength(240);
    expect(c.every(Number.isFinite)).toBe(true);
    expect(SPECTRUM_POINTS).toBe(240);
  });
  it('a 1 kHz tone peaks at the expected index, at every sample rate', () => {
    for (const sr of [16000, 44100, 48000]) {
      const x = harmonicTone({ f0: 1000, seconds: 1, sampleRate: sr, harmonics: 1 });
      const c = spectrumCurveDb(longTermSpectrum(x, sr));
      expect(Math.abs(argmax(c) - peakIdx), `sr ${sr}`).toBeLessThanOrEqual(2);
    }
  });
  it('silence and no voiced frames give the floor everywhere', () => {
    expect(spectrumCurveDb(longTermSpectrum(silence(1, 16000), 16000))).toEqual(new Array(240).fill(SPECTRUM_FLOOR_DB));
    const x = harmonicTone({ f0: 200, seconds: 1, sampleRate: 16000 });
    const none = spectrumCurveDb(longTermSpectrum(x, 16000, new Array(100).fill(false)));
    expect(none).toEqual(new Array(240).fill(-120));
  });
  it('a 200 Hz tone is lower around 5 kHz than at 200 Hz', () => {
    const x = harmonicTone({ f0: 200, seconds: 1, sampleRate: 16000, harmonics: 1 });
    const c = spectrumCurveDb(longTermSpectrum(x, 16000));
    const at = (hz: number) => c[Math.floor((240 * Math.log(hz / 100)) / Math.log(80))];
    expect(at(5000)).toBeLessThan(at(200));
  });
  it('points above Nyquist take the floor (8 kHz recording)', () => {
    const x = harmonicTone({ f0: 300, seconds: 1, sampleRate: 8000 });
    const c = spectrumCurveDb(longTermSpectrum(x, 8000));
    expect(c[239]).toBe(SPECTRUM_FLOOR_DB);
    expect(c.every(Number.isFinite)).toBe(true);
  });
});
