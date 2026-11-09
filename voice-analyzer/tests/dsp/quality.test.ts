import { describe, expect, it } from 'vitest';
import { trackPitch } from '../../src/dsp/pitch';
import { cpps, h1h2Db, hnrDb, stabilitySt } from '../../src/dsp/quality';
import type { PitchTrack } from '../../src/types';
import { harmonicTone, silence } from '../helpers/synth';

function concat(...parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Harmonic tone whose F0 swings ±depthSt semitones around f0 at rateHz (sinusoidal vibrato). */
function vibratoTone(f0: number, seconds: number, sampleRate: number, depthSt: number, rateHz = 5): Float32Array {
  const n = Math.round(seconds * sampleRate);
  const out = new Float32Array(n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const f = f0 * Math.pow(2, (depthSt * Math.sin((2 * Math.PI * rateHz * i) / sampleRate)) / 12);
    phase += (2 * Math.PI * f) / sampleRate;
    let s = 0;
    for (let k = 1; k <= 8; k++) s += Math.pow(10, (-12 * Math.log2(k)) / 20) * Math.sin(k * phase);
    out[i] = 0.4 * s;
  }
  return out;
}

const clean = (sr: number) => harmonicTone({ f0: 200, seconds: 2, sampleRate: sr, harmonics: 10 });
const noisy = (sr: number) => harmonicTone({ f0: 200, seconds: 2, sampleRate: sr, harmonics: 10, noiseDb: -10 });

describe('cpps', () => {
  it.each([16000, 44100, 48000])('is larger for a clean tone than for the same tone with noise at %i Hz', (sr) => {
    const a = cpps(clean(sr), sr);
    const b = cpps(noisy(sr), sr);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(Number.isFinite(a!)).toBe(true);
    expect(Number.isFinite(b!)).toBe(true);
    expect(a!).toBeGreaterThan(b! + 3);
  });

  it('is roughly sample-rate independent for the same tone', () => {
    const v = [16000, 44100, 48000].map((sr) => cpps(clean(sr), sr)!);
    expect(Math.max(...v) - Math.min(...v)).toBeLessThan(2);
  });

  it('returns null on silence and never NaN', () => {
    expect(cpps(silence(1, 16000), 16000)).toBeNull();
    expect(cpps(silence(1, 16000), 16000, { removeSilence: true })).toBeNull();
    expect(cpps(new Float32Array(0), 16000)).toBeNull();
    expect(cpps(new Float32Array(100), 16000)).toBeNull();
    for (const x of [clean(16000), noisy(16000), concat(silence(0.5, 16000), clean(16000))]) {
      const v = cpps(x, 16000);
      expect(v).not.toBeNull();
      expect(Number.isNaN(v)).toBe(false);
      expect(Number.isFinite(v!)).toBe(true);
    }
  });

  it.each([16000, 48000])('removeSilence makes 1 s of leading/trailing silence agree within 1 dB (%i Hz)', (sr) => {
    for (const make of [clean, noisy]) {
      const x = make(sr);
      const padded = concat(silence(1, sr), x, silence(1, sr));
      const ref = cpps(x, sr, { removeSilence: true })!;
      const got = cpps(padded, sr, { removeSilence: true })!;
      expect(Math.abs(got - ref)).toBeLessThanOrEqual(1);
      // without removal the silent frames drag the average down
      expect(cpps(padded, sr)!).toBeLessThan(got - 1);
    }
  });

  it('handles 15 s of 48 kHz audio quickly', () => {
    const x = harmonicTone({ f0: 200, seconds: 15, sampleRate: 48000, harmonics: 10, noiseDb: -20 });
    const t0 = performance.now();
    const v = cpps(x, 48000);
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(1500);
    expect(Number.isFinite(v!)).toBe(true);
  });
});

describe('hnrDb', () => {
  it.each([16000, 48000])('is larger without noise than with noiseDb -10 (%i Hz)', (sr) => {
    const a = clean(sr);
    const b = noisy(sr);
    const ha = hnrDb(a, sr, trackPitch(a, sr));
    const hb = hnrDb(b, sr, trackPitch(b, sr));
    expect(Number.isFinite(ha!)).toBe(true);
    expect(Number.isFinite(hb!)).toBe(true);
    expect(ha!).toBeGreaterThan(hb! + 10);
    // noise at -10 dB re harmonic RMS => HNR near 10 dB
    expect(hb!).toBeGreaterThan(6);
    expect(hb!).toBeLessThan(14);
  });

  it('is finite (clamped) for a perfectly periodic tone', () => {
    const x = harmonicTone({ f0: 200, seconds: 1, sampleRate: 16000, harmonics: 4 });
    const h = hnrDb(x, 16000, trackPitch(x, 16000));
    expect(Number.isFinite(h!)).toBe(true);
    expect(h!).toBeLessThanOrEqual(60.1);
  });

  it('returns null with fewer than 10 voiced frames', () => {
    const x = silence(1, 16000);
    expect(hnrDb(x, 16000, trackPitch(x, 16000))).toBeNull();
    const nine: PitchTrack = { hopSeconds: 0.01, f0: [...Array(9).fill(200), null], clarity: Array(10).fill(1) };
    expect(hnrDb(clean(16000), 16000, nine)).toBeNull();
  });
});

describe('h1h2Db', () => {
  it.each([
    [16000, -12],
    [48000, -12],
    [44100, -6],
  ])('matches the synthetic harmonic tilt (%i Hz, %i dB/oct)', (sr, tilt) => {
    for (const f0 of [120, 220]) {
      const x = harmonicTone({ f0, seconds: 1, sampleRate: sr, harmonics: 10, tiltDbPerOctave: tilt });
      const v = h1h2Db(x, sr, trackPitch(x, sr));
      expect(Math.abs(v! - -tilt)).toBeLessThan(1);
    }
  });

  it('returns null with fewer than 10 voiced frames', () => {
    const x = silence(1, 16000);
    expect(h1h2Db(x, 16000, trackPitch(x, 16000))).toBeNull();
  });
});

describe('stabilitySt', () => {
  it('is larger with ±1 semitone vibrato than for a steady tone', () => {
    const steady = harmonicTone({ f0: 200, seconds: 2, sampleRate: 16000, harmonics: 8 });
    const vib = vibratoTone(200, 2, 16000, 1);
    const s = stabilitySt(trackPitch(steady, 16000))!;
    const v = stabilitySt(trackPitch(vib, 16000))!;
    expect(s).toBeLessThan(0.1);
    // SD of a ±1 st sinusoid is 1/sqrt(2)
    expect(v).toBeGreaterThan(0.5);
    expect(v).toBeLessThan(0.9);
  });

  it('is the population SD of voiced semitones and null with fewer than 10 voiced frames', () => {
    const f0 = [100, 200, 100, 200, 100, 200, 100, 200, 100, 200, null];
    expect(stabilitySt({ hopSeconds: 0.01, f0, clarity: f0.map(() => 1) })).toBeCloseTo(6, 6);
    expect(stabilitySt({ hopSeconds: 0.01, f0: [200, 200, null], clarity: [1, 1, 0] })).toBeNull();
    expect(stabilitySt({ hopSeconds: 0.01, f0: [], clarity: [] })).toBeNull();
  });
});
