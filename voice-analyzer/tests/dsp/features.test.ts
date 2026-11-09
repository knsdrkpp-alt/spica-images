import { describe, expect, it } from 'vitest';
import { extractSentence, extractVowel, speechSeconds } from '../../src/dsp/features';
import { READING_MORAE } from '../../src/diagnosis/config';
import { harmonicTone, silence } from '../helpers/synth';

function concat(parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((a, p) => a + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Speech-like: tone bursts of 0.15-0.4 s separated by 50-100 ms gaps, total >= seconds. */
function speechLike(seconds: number, sr: number): Float32Array {
  const parts: Float32Array[] = [];
  let t = 0;
  let i = 0;
  while (t < seconds) {
    const burst = 0.15 + ((i * 7) % 6) * 0.05;
    const gap = 0.05 + ((i * 3) % 6) * 0.01;
    parts.push(harmonicTone({ f0: 120 + ((i * 13) % 40), seconds: burst, sampleRate: sr }));
    parts.push(silence(gap, sr));
    t += burst + gap;
    i++;
  }
  return concat(parts).subarray(0, Math.round(seconds * sr));
}

function expectNoNaN(v: unknown, path = 'root'): void {
  if (typeof v === 'number') {
    expect(Number.isFinite(v), `${path} is ${v}`).toBe(true);
  } else if (Array.isArray(v)) {
    v.forEach((x, i) => expectNoNaN(x, `${path}[${i}]`));
  } else if (v && typeof v === 'object') {
    for (const [k, x] of Object.entries(v)) expectNoNaN(x, `${path}.${k}`);
  }
}

describe('extractVowel', () => {
  it('measures a 200 Hz tone', () => {
    const f = extractVowel(harmonicTone({ f0: 200, seconds: 5, sampleRate: 16000 }), 16000);
    expect(f.f0MedianHz).not.toBeNull();
    expect(Math.abs((f.f0MedianHz as number) - 200)).toBeLessThanOrEqual(2);
    expect(f.bandShare).toHaveLength(12);
    expect(Math.abs(f.bandShare.reduce((a, b) => a + b, 0) - 1)).toBeLessThan(1e-6);
    expect(f.voicedSeconds).toBeGreaterThanOrEqual(3);
    expect(f.cpps).not.toBeNull();
    expect(f.f0StabilitySt).not.toBeNull();
    expectNoNaN(f);
  });

  it('handles silence without NaN', () => {
    const f = extractVowel(silence(5, 16000), 16000);
    expectNoNaN(f);
    expect(f.f0MedianHz).toBeNull();
    expect(f.f0RangeSt).toBeNull();
    expect(f.hnrDb).toBeNull();
    expect(f.bandShare).toEqual(new Array(12).fill(0));
    expect(f.voicedSeconds).toBe(0);
  });

  it('handles very short input without NaN', () => {
    expectNoNaN(extractVowel(new Float32Array(0), 16000));
    expectNoNaN(extractVowel(harmonicTone({ f0: 200, seconds: 0.05, sampleRate: 16000 }), 16000));
  });

  it('excludes the first and last 0.75 s from analysis', () => {
    const sr = 16000;
    const x = concat([
      harmonicTone({ f0: 200, seconds: 0.75, sampleRate: sr }),
      harmonicTone({ f0: 300, seconds: 2.5, sampleRate: sr }),
      harmonicTone({ f0: 200, seconds: 0.75, sampleRate: sr }),
    ]);
    const f = extractVowel(x, sr);
    expect(Math.abs((f.f0MedianHz as number) - 300)).toBeLessThanOrEqual(2);
    expect(f.voicedSeconds).toBeLessThan(2.6);
  });

  it('f0RangeSt spans a two-pitch signal', () => {
    const sr = 16000;
    const x = concat([
      harmonicTone({ f0: 150, seconds: 2.5, sampleRate: sr }),
      harmonicTone({ f0: 300, seconds: 2.5, sampleRate: sr }),
    ]);
    const f = extractVowel(x, sr);
    expect(Math.abs((f.f0RangeSt as number) - 12)).toBeLessThan(1.5);
  });

  it('uses the whole signal when too short to trim', () => {
    const f = extractVowel(harmonicTone({ f0: 200, seconds: 2, sampleRate: 16000 }), 16000);
    expect(f.voicedSeconds).toBeGreaterThan(1);
  });

  it('is consistent across sample rates', () => {
    const argmax = (a: number[]) => a.indexOf(Math.max(...a));
    const tone = (f0: number, sr: number) => harmonicTone({ f0, seconds: 4, sampleRate: sr });
    const rates = [16000, 44100, 48000];
    for (const sr of rates) {
      const r = extractVowel(tone(200, sr), sr);
      expect(Math.abs((r.f0MedianHz as number) - 200)).toBeLessThanOrEqual(2);
    }
    // 200 Hz: same dominant band and similar top-two shares across rates
    const top = rates.map((sr) => extractVowel(tone(200, sr), sr).bandShare);
    expect(new Set(top.map(argmax)).size).toBe(1);
    for (const k of [1, 2]) {
      const v = top.map((b) => b[k]);
      expect(Math.max(...v) - Math.min(...v)).toBeLessThan(0.15);
    }
    // 200 Hz sits ~4% from the 208 Hz band edge, so its argmax legitimately depends on FFT bin
    // layout; use a tone mid-band (208-299 Hz) for the cross-rate band comparison.
    const arg = rates.map((sr) => argmax(extractVowel(tone(250, sr), sr).bandShare));
    expect(new Set(arg).size).toBe(1);
  });
});

describe('speechSeconds', () => {
  it('excludes pauses of 250 ms or more but keeps shorter gaps', () => {
    const sr = 16000;
    const tone = (s: number) => harmonicTone({ f0: 150, seconds: s, sampleRate: sr });
    const x = concat([tone(1), silence(0.1, sr), tone(1), silence(0.5, sr), tone(1)]);
    expect(speechSeconds(x, sr)).toBeCloseTo(3.1, 1);
  });
  it('is 0 for silence', () => {
    expect(speechSeconds(silence(2, 16000), 16000)).toBe(0);
  });
});

describe('extractSentence', () => {
  const sr = 16000;
  it('articulation rate exceeds speaking rate with leading/trailing silence', () => {
    const x = concat([silence(1, sr), speechLike(8, sr), silence(1, sr)]);
    const f = extractSentence(x, sr);
    expect(f.speakingRate).toBeCloseTo(READING_MORAE / 10, 6);
    expect(f.articulationRate).toBeGreaterThan(f.speakingRate);
    expectNoNaN(f);
  });

  it('articulation rate is invariant to added silence', () => {
    const s = speechLike(8, sr);
    const a = extractSentence(s, sr);
    const b = extractSentence(concat([silence(1, sr), s, silence(1, sr)]), sr);
    expect(Math.abs(a.articulationRate - b.articulationRate) / a.articulationRate).toBeLessThan(0.1);
  });

  it('handles silence without NaN', () => {
    const f = extractSentence(silence(3, sr), sr);
    expectNoNaN(f);
    expect(f.articulationRate).toBe(0);
    expect(f.speakingRate).toBe(0);
    expect(f.cpps).toBeNull();
  });

  it('runs 15 s at 48 kHz in under 3 s', () => {
    const x = speechLike(15, 48000);
    const t0 = performance.now();
    extractSentence(x, 48000);
    expect(performance.now() - t0).toBeLessThan(3000);
  });
});
