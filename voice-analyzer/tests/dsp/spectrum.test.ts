import { describe, it, expect } from 'vitest';
import { harmonicTone, silence } from '../helpers/synth';
import {
  longTermSpectrum,
  bandShares,
  alphaRatioDb,
  spectralCentroidHz,
  spectrumFrameLayout,
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
  it('uses ~40 ms power-of-two frames with 50% hop', () => {
    expect(spectrumFrameLayout(16000)).toEqual({ frameLength: 1024, hop: 512 });
    expect(spectrumFrameLayout(44100)).toEqual({ frameLength: 2048, hop: 1024 });
    expect(spectrumFrameLayout(48000)).toEqual({ frameLength: 2048, hop: 1024 });
    expect(spectrumFrameLayout(8000).frameLength).toBe(512);
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
    const { hop } = spectrumFrameLayout(sr);
    const a = harmonicTone({ f0: 300, seconds: 0.5, sampleRate: sr, harmonics: 1 });
    const x = new Float32Array(a.length * 2);
    x.set(a, 0); // second half silent
    const nFrames = Math.floor((x.length - 1024) / hop) + 1;
    const mask = Array.from({ length: nFrames }, (_, i) => i * hop + 1024 <= a.length);
    const c = spectralCentroidHz(longTermSpectrum(x, sr, mask));
    expect(Math.abs(c - 300)).toBeLessThan(15);
  });

  it('is finite for silence, short input and empty mask', () => {
    const sr = 16000;
    const s = longTermSpectrum(silence(0.5, sr), sr);
    expect(bandShares(s)).toEqual(new Array(12).fill(0));
    expect(Number.isFinite(alphaRatioDb(s))).toBe(true);
    expect(spectralCentroidHz(s)).toBe(0);
    const short = longTermSpectrum(new Float32Array(100).fill(0.1), sr);
    expect(short.power.length).toBe(513);
    const none = longTermSpectrum(harmonicTone({ f0: 200, seconds: 0.5, sampleRate: sr }), sr, [false]);
    expect(none.power.every((v) => v === 0)).toBe(true);
  });

  it('zeros bands above Nyquist and renormalizes', () => {
    const sr = 8000; // Nyquist 4000: bands 10,11 (3860+...) 11 starts 5563
    const x = harmonicTone({ f0: 1000, seconds: 1, sampleRate: sr, harmonics: 1 });
    const shares = bandShares(longTermSpectrum(x, sr));
    expect(shares[11]).toBe(0);
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
  });
});
