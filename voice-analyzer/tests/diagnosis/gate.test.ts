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
    expect(run({ samples: s })).toMatchObject({ ok: false, reason: 'clipping' });
  });

  it('rejects a run of 3 consecutive clipped samples even below the ratio', () => {
    const s = speech();
    s[1000] = 1;
    s[1001] = 1;
    s[1002] = 1;
    expect(run({ samples: s })).toMatchObject({ ok: false, reason: 'clipping' });
  });

  it('does not reject two isolated clipped samples', () => {
    const s = speech();
    s[1000] = 1;
    s[5000] = -1;
    expect(run({ samples: s }).ok).toBe(true);
  });

  /** Pre-roll of white noise placed `snr` dB below the (filtered) speech level the gate measures. */
  function snrRun(snr: number, sr = SR, task: 'vowel' | 'sentence' = 'vowel', peakDb = -10) {
    const s = scaleToPeakDb(
      harmonicTone({ f0: 150, seconds: 4, sampleRate: sr, tiltDbPerOctave: -6, noiseDb: -20 }),
      peakDb,
    );
    const base = run({ samples: s, sampleRate: sr, task, preRoll: silence(0.5, sr) });
    const speechDb = base.detail.speechDbfs;
    const noise = whiteNoise(sr / 2, Math.pow(10, (speechDb - snr) / 20));
    return run({ samples: s, sampleRate: sr, task, preRoll: noise });
  }

  it('warns at SNR 27 dB, accepts silently at 40 dB, rejects below 20 dB', () => {
    const borderline = snrRun(27);
    expect(borderline.ok).toBe(true);
    if (borderline.ok) expect(borderline.warnings).toContain('noise-borderline');
    const lowish = snrRun(22);
    expect(lowish.ok).toBe(true);
    if (lowish.ok) expect(lowish.warnings).toContain('noise-borderline');
    expect(snrRun(17)).toMatchObject({ ok: false, reason: 'too-noisy' });
    const clean = snrRun(40);
    expect(clean.ok).toBe(true);
    if (clean.ok) expect(clean.warnings).not.toContain('noise-borderline');
  });

  it('has exact boundaries at SNR 20 dB (reject) and 30 dB (warning)', () => {
    expect(snrRun(19.5)).toMatchObject({ ok: false, reason: 'too-noisy' });
    const just20 = snrRun(20.5);
    expect(just20.ok).toBe(true);
    if (just20.ok) expect(just20.warnings).toContain('noise-borderline');
    const just29 = snrRun(29.5);
    expect(just29.ok && just29.warnings.includes('noise-borderline')).toBe(true);
    // Quieter speech so that the pre-roll stays below the -50 dBFS noise-floor warning.
    const just31 = snrRun(30.5, SR, 'vowel', -22);
    expect(just31.ok && just31.warnings.includes('noise-borderline')).toBe(false);
  });

  it('exposes finite detail on rejects and accepts', () => {
    const r = snrRun(17);
    expect(r.ok).toBe(false);
    expect(r.detail.snrDb!).toBeCloseTo(17, 0);
    for (const v of Object.values(r.detail)) expect(Number.isFinite(v as number)).toBe(true);
    const noRoll = run({ preRoll: new Float32Array(0) });
    expect(noRoll.detail.snrDb).toBeNull();
    expect(noRoll.detail.noiseFloorDbfs).toBeNull();
    expect(Number.isFinite(noRoll.detail.peakDbfs)).toBe(true);
    const quiet = run({ samples: scaleToPeakDb(speech(), -35) });
    expect(quiet).toMatchObject({ ok: false, reason: 'too-quiet' });
    expect(quiet.detail.peakDbfs).toBeCloseTo(-35, 0);
  });

  describe.each([16000, 44100, 48000])('SNR filtering at %i Hz', (sr) => {
    const lvl = (db: number) => Math.pow(10, db / 20);
    it('ignores a pure DC offset of 0.01 in the pre-roll', () => {
      const pre = new Float32Array(sr / 2).fill(0.01);
      const r = snrRun(60, sr);
      const withDc = run({
        samples: scaleToPeakDb(harmonicTone({ f0: 150, seconds: 4, sampleRate: sr, tiltDbPerOctave: -6, noiseDb: -20 }), -10),
        sampleRate: sr,
        preRoll: pre,
      });
      expect(withDc.ok).toBe(true);
      expect(withDc.detail.snrDb!).toBeGreaterThan(50);
      expect(r.ok).toBe(true);
    });
    const humCase = (hz: number, kind: 'sine' | 'noise') => {
      const n = sr / 2;
      const pre = new Float32Array(n);
      if (kind === 'sine') {
        for (let i = 0; i < n; i++) pre[i] = Math.SQRT2 * lvl(-35) * Math.sin((2 * Math.PI * hz * i) / sr);
      }
      return run({
        samples: scaleToPeakDb(harmonicTone({ f0: 150, seconds: 4, sampleRate: sr, tiltDbPerOctave: -6, noiseDb: -20 }), -10),
        sampleRate: sr,
        preRoll: pre,
      });
    };
    it('does not count a 50 Hz hum at -35 dBFS as noise', () => {
      const r = humCase(50, 'sine');
      expect(r.ok).toBe(true);
      // 2nd-order 80 Hz high-pass: about -9 dB at 50 Hz.
      expect(r.detail.noiseFloorDbfs!).toBeLessThan(-42);
      expect(r.detail.noiseFloorDbfs!).toBeGreaterThan(-46);
    });
    it('does count a 300 Hz tone at -35 dBFS as noise', () => {
      const r = humCase(300, 'sine');
      expect(r.detail.noiseFloorDbfs!).toBeGreaterThan(-37);
      expect(r.detail.noiseFloorDbfs!).toBeLessThan(-33);
      expect(r.detail.snrDb!).toBeLessThan(25);
    });
    it('rejects and accepts around 20 dB alike', () => {
      expect(snrRun(17, sr)).toMatchObject({ ok: false, reason: 'too-noisy' });
      expect(snrRun(22, sr).ok).toBe(true);
    });
  });

  it('measures speech level over the 20 dB window (pauses do not lower it)', () => {
    const tone = speech(1);
    const gap = silence(1, SR);
    const withPauses = new Float32Array(tone.length * 3 + gap.length * 2);
    withPauses.set(tone, 0);
    withPauses.set(tone, tone.length + gap.length);
    withPauses.set(tone, 2 * (tone.length + gap.length));
    const plain = run({ samples: tone });
    const paused = run({ samples: withPauses });
    expect(Math.abs(paused.detail.speechDbfs - plain.detail.speechDbfs)).toBeLessThan(0.5);
  });

  it('rejects silent input as no-voice without NaN or throwing', () => {
    const r = run({
      samples: silence(3, SR),
      features: features({ voicedSeconds: 0, f0MedianHz: null, f0StabilitySt: null }),
    });
    expect(r).toMatchObject({ ok: false, reason: 'no-voice' });
  });

  it('rejects a very quiet recording as too-quiet, warns when merely low', () => {
    const quiet = run({ samples: scaleToPeakDb(speech(), -35) });
    expect(quiet).toMatchObject({ ok: false, reason: 'too-quiet' });
    const low = run({ samples: scaleToPeakDb(speech(), -25) });
    expect(low.ok).toBe(true);
    if (low.ok) expect(low.warnings).toContain('low-level');
  });

  it('rejects a short vowel and a short sentence', () => {
    expect(run({ features: features({ voicedSeconds: 2 }) })).toMatchObject({ ok: false, reason: 'vowel-too-short' });
    expect(run({ task: 'sentence', features: features({ voicedSeconds: 2 }) })).toMatchObject({ ok: false, reason: 'sentence-too-short' });
  });

  it('rejects an unstable vowel but not a steady one', () => {
    expect(run({ features: features({ f0StabilitySt: 1 }) })).toMatchObject({ ok: false, reason: 'vowel-unstable' });
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
    expect(run({ samples: silence(3, SR) })).toMatchObject({ ok: false, reason: 'too-quiet' });
    expect(run({ samples: new Float32Array(0) })).toMatchObject({ ok: false, reason: 'too-quiet' });
  });

  it('treats an empty preRoll as unknown SNR: no reject, noise-borderline warning', () => {
    const r = run({ preRoll: new Float32Array(0) });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.warnings).toContain('noise-borderline');
  });
});
