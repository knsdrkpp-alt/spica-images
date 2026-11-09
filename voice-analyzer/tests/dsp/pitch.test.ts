import { describe, expect, it } from 'vitest';
import { hzToSemitone, trackPitch, voicedMask } from '../../src/dsp/pitch';
import { longTermSpectrum, spectrumFrameCount } from '../../src/dsp/spectrum';
import { harmonicTone, silence } from '../helpers/synth';

function voicedValues(f0: Array<number | null>): number[] {
  return f0.filter((v): v is number => v !== null);
}
function median(v: number[]): number {
  const s = [...v].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
function noise(n: number, seed = 7): Float32Array {
  let a = seed;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
    out[i] = (a / 4294967296 - 0.5) * 1.6;
  }
  return out;
}

describe('trackPitch', () => {
  it('finds 200 Hz within 2 Hz and uses 10 ms hop', () => {
    const t = trackPitch(harmonicTone({ f0: 200, seconds: 1, sampleRate: 16000, harmonics: 8 }), 16000);
    expect(t.hopSeconds).toBeCloseTo(0.01, 6);
    expect(t.f0.length).toBe(t.clarity.length);
    const v = voicedValues(t.f0);
    expect(v.length).toBeGreaterThan(t.f0.length * 0.9);
    expect(Math.abs(median(v) - 200)).toBeLessThanOrEqual(2);
  });

  it.each([120, 350])('finds %i Hz within 2 Hz', (f0) => {
    const t = trackPitch(harmonicTone({ f0, seconds: 1, sampleRate: 16000, harmonics: 8 }), 16000);
    expect(Math.abs(median(voicedValues(t.f0)) - f0)).toBeLessThanOrEqual(2);
  });

  it.each([16000, 44100, 48000])('is accurate at %i Hz sample rate', (sr) => {
    for (const f0 of [120, 200, 350]) {
      const t = trackPitch(harmonicTone({ f0, seconds: 1, sampleRate: sr, harmonics: 8 }), sr);
      const v = voicedValues(t.f0);
      expect(v.length).toBeGreaterThan(t.f0.length * 0.9);
      expect(Math.abs(median(v) - f0)).toBeLessThanOrEqual(2);
    }
  });

  it('clarity is finite in [0,1] and high for a clean tone', () => {
    const t = trackPitch(harmonicTone({ f0: 200, seconds: 1, sampleRate: 16000, harmonics: 8 }), 16000);
    for (const c of t.clarity) {
      expect(Number.isFinite(c)).toBe(true);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(c).toBeLessThanOrEqual(1);
    }
    expect(median(t.clarity)).toBeGreaterThan(0.9);
  });

  it.each([
    ['silence', () => silence(1, 16000)],
    ['white noise', () => noise(16000)],
  ])('%s is (almost) never voiced and has no NaN', (_n, make) => {
    const t = trackPitch(make(), 16000);
    expect(t.f0.length).toBeGreaterThan(50);
    expect(voicedValues(t.f0).length / t.f0.length).toBeLessThan(0.05);
    expect(t.f0.some((v) => v !== null && Number.isNaN(v))).toBe(false);
    expect(t.clarity.some((c) => !Number.isFinite(c))).toBe(false);
  });

  it('nulls the frame hit by a 400 Hz (octave-up) burst in a 200 Hz tone', () => {
    const sr = 16000;
    const hop = 160;
    // 200 Hz tone, phase-continuous 400 Hz burst of 400 samples starting at frame 40
    const start = 40 * hop;
    const x = new Float32Array(sr);
    let phase = 0;
    for (let i = 0; i < sr; i++) {
      const f = i >= start && i < start + 400 ? 400 : 200;
      phase += (2 * Math.PI * f) / sr;
      x[i] = 0.5 * Math.sin(phase) + 0.25 * Math.sin(2 * phase);
    }
    const t = trackPitch(x, sr);
    expect(t.f0[40]).toBeNull();
    for (const i of [30, 36, 38, 42, 46, 60]) expect(Math.abs((t.f0[i] ?? 0) - 200)).toBeLessThanOrEqual(2);
  });

  it('tracks 15 s of 48 kHz audio quickly', () => {
    const x = harmonicTone({ f0: 200, seconds: 15, sampleRate: 48000, harmonics: 8 });
    const t0 = performance.now();
    const t = trackPitch(x, 48000);
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(1500);
    expect(Math.abs(median(voicedValues(t.f0)) - 200)).toBeLessThanOrEqual(2);
  });

  it.each([
    [48000, 15500],
    [44100, 21000],
  ])('rejects out-of-band %i Hz-rate content at %i Hz (no aliasing into F0 band)', (sr, hz) => {
    const x = new Float32Array(sr * 3);
    for (let i = 0; i < x.length; i++) x[i] = 0.8 * Math.sin((2 * Math.PI * hz * i) / sr);
    const t = trackPitch(x, sr);
    expect(t.f0.length).toBeGreaterThan(100);
    expect(voicedValues(t.f0).length / t.f0.length).toBeLessThan(0.05);
  });

  it('does not throw on signals shorter than a frame', () => {
    const t = trackPitch(new Float32Array(100), 16000);
    expect(t.f0).toEqual([]);
    expect(t.clarity).toEqual([]);
    expect(trackPitch(new Float32Array(0), 16000).f0).toEqual([]);
  });
});

describe('voicedMask', () => {
  it('has one entry per spectrum frame, mostly true for a tone', () => {
    const sr = 16000;
    const x = harmonicTone({ f0: 200, seconds: 1, sampleRate: sr, harmonics: 8 });
    const mask = voicedMask(trackPitch(x, sr), x.length, sr);
    expect(mask.length).toBe(spectrumFrameCount(x.length, sr));
    expect(mask.filter(Boolean).length).toBeGreaterThan(mask.length * 0.9);
    // usable with longTermSpectrum
    expect(() => longTermSpectrum(x, sr, mask)).not.toThrow();
  });

  it('is all false for silence and has at least one entry for tiny input', () => {
    const sr = 16000;
    const x = silence(1, sr);
    const mask = voicedMask(trackPitch(x, sr), x.length, sr);
    expect(mask.length).toBeGreaterThan(0);
    expect(mask.every((m) => !m)).toBe(true);
    expect(voicedMask(trackPitch(new Float32Array(10), sr), 10, sr)).toEqual([false]);
  });
});

describe('hzToSemitone', () => {
  it('is 12 per octave relative to refHz (default 100)', () => {
    expect(hzToSemitone(200, 100)).toBeCloseTo(12, 6);
    expect(hzToSemitone(200)).toBeCloseTo(12, 6);
    expect(hzToSemitone(50)).toBeCloseTo(-12, 6);
    expect(hzToSemitone(440, 220)).toBeCloseTo(12, 6);
  });
});
