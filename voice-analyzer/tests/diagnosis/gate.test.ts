import { describe, expect, it } from 'vitest';
import { checkGate } from '../../src/diagnosis/gate';
import type { TaskFeatures } from '../../src/types';
import { harmonicTone, silence } from '../helpers/synth';

const SR = 48000;

function features(over: Partial<TaskFeatures> = {}): TaskFeatures {
  return {
    f0MedianHz: 150,
    f0RangeSt: 3,
    f0StabilitySt: 0.1,
    cpps: 8,
    hnrDb: 18,
    h1h2Db: 3,
    alphaRatioDb: -15,
    centroidHz: 1200,
    bandShare: new Array(12).fill(1 / 12),
    voicedSeconds: 4,
    ...over,
  };
}

function scaleToPeakDb(x: Float32Array, peakDb: number): Float32Array {
  let p = 0;
  for (const v of x) p = Math.max(p, Math.abs(v));
  const g = Math.pow(10, peakDb / 20) / p;
  return x.map((v) => v * g);
}

function rms(x: Float32Array): number {
  let e = 0;
  for (const v of x) e += v * v;
  return Math.sqrt(e / x.length);
}

function whiteNoise(n: number, targetRms: number, seed = 7): Float32Array {
  let a = seed >>> 0;
  const rnd = () => {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0;
    return a / 4294967296;
  };
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = rnd() - 0.5;
  const g = targetRms / rms(out);
  return out.map((v) => v * g);
}

/** Broadband-ish speech-like tone at about -10 dBFS peak. */
function speech(seconds = 4): Float32Array {
  return scaleToPeakDb(
    harmonicTone({ f0: 150, seconds, sampleRate: SR, tiltDbPerOctave: -6, noiseDb: -20 }),
    -10,
  );
}

const quietPreRoll = () => silence(0.5, SR);

function run(over: Partial<Parameters<typeof checkGate>[0]> = {}) {
  return checkGate({
    samples: speech(),
    sampleRate: SR,
    preRoll: quietPreRoll(),
    task: 'vowel',
    features: features(),
    processingOn: false,
    ...over,
  });
}

describe('checkGate', () => {
  it('accepts a normal recording', () => {
    const r = run();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings).toEqual([]);
  });

  it('rejects clipping by ratio', () => {
    const s = speech();
    for (let i = 0; i < s.length; i += 500) s[i] = i % 1000 === 0 ? 1 : -1;
    expect(run({ samples: s })).toEqual({ ok: false, reason: 'clipping' });
  });

  it('rejects a run of 3 consecutive clipped samples even below the ratio', () => {
    const s = speech();
    s[1000] = 1;
    s[1001] = 1;
    s[1002] = 1;
    expect(run({ samples: s })).toEqual({ ok: false, reason: 'clipping' });
  });

  it('does not reject two isolated clipped samples', () => {
    const s = speech();
    s[1000] = 1;
    s[5000] = -1;
    expect(run({ samples: s }).ok).toBe(true);
  });

  it('warns at SNR 27 dB and rejects at SNR 20 dB', () => {
    const s = speech();
    const snrCase = (snr: number) =>
      run({ samples: s, preRoll: whiteNoise(SR / 2, rms(s) * Math.pow(10, -snr / 20)) });
    const borderline = snrCase(27);
    expect(borderline.ok).toBe(true);
    if (borderline.ok) expect(borderline.warnings).toContain('noise-borderline');
    expect(snrCase(20)).toEqual({ ok: false, reason: 'too-noisy' });
    const clean = snrCase(40);
    expect(clean.ok).toBe(true);
    if (clean.ok) expect(clean.warnings).not.toContain('noise-borderline');
  });

  it('rejects silent input as no-voice without NaN or throwing', () => {
    const r = run({
      samples: silence(3, SR),
      features: features({ voicedSeconds: 0, f0MedianHz: null, f0StabilitySt: null }),
    });
    expect(r).toEqual({ ok: false, reason: 'no-voice' });
  });

  it('rejects a very quiet recording as too-quiet, warns when merely low', () => {
    const quiet = run({ samples: scaleToPeakDb(speech(), -35) });
    expect(quiet).toEqual({ ok: false, reason: 'too-quiet' });
    const low = run({ samples: scaleToPeakDb(speech(), -25) });
    expect(low.ok).toBe(true);
    if (low.ok) expect(low.warnings).toContain('low-level');
  });

  it('rejects a short vowel and a short sentence', () => {
    expect(run({ features: features({ voicedSeconds: 2 }) })).toEqual({
      ok: false,
      reason: 'vowel-too-short',
    });
    expect(run({ task: 'sentence', features: features({ voicedSeconds: 2 }) })).toEqual({
      ok: false,
      reason: 'sentence-too-short',
    });
  });

  it('rejects an unstable vowel but not a steady one', () => {
    expect(run({ features: features({ f0StabilitySt: 1 }) })).toEqual({
      ok: false,
      reason: 'vowel-unstable',
    });
    expect(run({ features: features({ f0StabilitySt: 0.3 }) }).ok).toBe(true);
    // stability only matters for vowels
    expect(run({ task: 'sentence', features: features({ f0StabilitySt: 1 }) }).ok).toBe(true);
  });

  it('warns when processing is on', () => {
    const r = run({ processingOn: true });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings).toContain('processing-on');
  });

  it('warns about band-limited audio for sentences only, not vowels or broadband signals', () => {
    const limited = scaleToPeakDb(
      harmonicTone({ f0: 150, seconds: 4, sampleRate: SR, harmonics: 20 }),
      -10,
    );
    const vowel = run({ samples: limited, task: 'vowel' });
    expect(vowel.ok).toBe(true);
    if (vowel.ok) expect(vowel.warnings).not.toContain('bluetooth-band-limited');
    const r = run({ samples: limited, task: 'sentence' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings).toContain('bluetooth-band-limited');
    // speech() has noise at -20 dB, standing in for fricative energy above 4 kHz
    const b = run({ task: 'sentence' });
    expect(b.ok).toBe(true);
    if (b.ok) expect(b.warnings).not.toContain('bluetooth-band-limited');
  });

  it('rejects silent or empty samples without NaN or throwing', () => {
    expect(run({ samples: silence(3, SR) })).toEqual({ ok: false, reason: 'too-quiet' });
    expect(run({ samples: new Float32Array(0) })).toEqual({ ok: false, reason: 'too-quiet' });
  });

  it('treats an empty preRoll as unknown SNR: no reject, noise-borderline warning', () => {
    const r = run({ preRoll: new Float32Array(0) });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings).toContain('noise-borderline');
  });
});
