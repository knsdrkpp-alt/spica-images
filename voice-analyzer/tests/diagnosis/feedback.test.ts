import { describe, it, expect } from 'vitest';
import { buildFeedback, findBannedWords, type Feedback } from '../../src/diagnosis/feedback';
import { FIXED_FOOTER, STOP_NOTICE, TYPE_LABEL, BANNED_WORDS, ALLOWED_FIXED_COPY } from '../../src/diagnosis/copy';
import { BAND_EDGES_HZ } from '../../src/diagnosis/config';
import type { Classification } from '../../src/diagnosis/classify';
import type { Profile, SetFeatures, VoiceType } from '../../src/types';

const TYPES: [VoiceType, VoiceType, VoiceType, VoiceType] = ['clear-bright', 'soft-bright', 'clear-calm', 'soft-calm'];

function share(dominant: number): number[] {
  const s = new Array(12).fill(0.5 / 11);
  s[dominant] = 0.5;
  return s;
}

function fx(o: {
  cpps?: number | null; range?: number | null; stab?: number | null; rate?: number; dominant?: number;
}): SetFeatures {
  const base = {
    f0MedianHz: 200, f0RangeSt: o.range === undefined ? 5 : o.range,
    f0StabilitySt: o.stab === undefined ? 0.2 : o.stab,
    cpps: o.cpps === undefined ? 10 : o.cpps, hnrDb: 10, h1h2Db: 0,
    alphaRatioDb: 0, centroidHz: 1000, bandShare: share(o.dominant ?? 5), voicedSeconds: 3,
  };
  return {
    vowel: base,
    sentence: { ...base, articulationRate: o.rate ?? 6.5, speakingRate: 5 },
    flags: { processingOn: false },
  };
}

const strong = fx({});
const weak = fx({ cpps: null, range: 1, stab: 1.2, rate: 9.5 });
const weakSlow = fx({ range: 1, stab: 1.2, rate: 3 });
const oneWeak = fx({ range: 1 });
const fixtures = [strong, weak, weakSlow, oneWeak, fx({ stab: 0.9 }), fx({ rate: 0 }), fx({ range: null, stab: null })];
const profiles: Profile[] = [
  { brightness: 80, clarity: 80 }, { brightness: 20, clarity: 20 },
  { brightness: 80, clarity: 20 }, { brightness: 50, clarity: 50 },
];

const classifications: Classification[] = [
  ...TYPES.map((type): Classification => ({ kind: 'type', type })),
  { kind: 'mixed', between: ['clear-bright', 'soft-bright'] },
  { kind: 'mixed', between: ['clear-calm', 'soft-calm'] },
  { kind: 'mixed', between: TYPES },
];

function allText(f: Feedback): string {
  return [f.headline, f.tendency, ...f.strengths, ...f.focus, ...f.practice.flatMap((p) => [p.title, p.how])].join('\n');
}

describe('copy constants', () => {
  it('have the exact strings', () => {
    expect(FIXED_FOOTER).toBe('声のかすれが長く続く(目安として4週間以上)、息苦しさや吸うときの音、痛み、痰に血が混じる、飲み込みにくさ、首のしこりがあるときは、医療機関(耳鼻咽喉科)に相談してください。このアプリは医療や診断のためのものではありません。');
    expect(STOP_NOTICE).toBe('痛み、疲れ、かすれの悪化があれば、練習をやめてください。');
    expect(ALLOWED_FIXED_COPY).toEqual([FIXED_FOOTER, STOP_NOTICE]);
    expect(TYPE_LABEL).toEqual({
      'clear-bright': '透明感', 'soft-bright': 'ふんわり軽やか', 'clear-calm': '深み・安定', 'soft-calm': 'やわらか包容',
    });
    expect(BANNED_WORDS).toEqual(['診断', '検査', 'スクリーニング', '異常', '正常', 'リスク', '疑い', '悪化', '改善します', '高精度']);
  });
});

describe('findBannedWords', () => {
  it('ignores the allowed fixed copy', () => {
    expect(findBannedWords(FIXED_FOOTER)).toEqual([]);
    expect(findBannedWords(STOP_NOTICE)).toEqual([]);
  });
  it('finds a banned word', () => {
    expect(findBannedWords('今回は正常です')).toEqual(['正常']);
  });
  it('returns several in BANNED_WORDS order without duplicates', () => {
    expect(findBannedWords('リスクがあり、診断も正常も、診断')).toEqual(['診断', '正常', 'リスク']);
  });
  it('still flags banned words next to allowed copy', () => {
    expect(findBannedWords(STOP_NOTICE + '異常')).toEqual(['異常']);
  });
});

describe('buildFeedback', () => {
  it('uses no banned or forbidden words anywhere', () => {
    for (const c of classifications) for (const sets of [1, 2, 3]) for (const f of fixtures) for (const p of profiles) {
      const text = allText(buildFeedback(c, p, f, sets));
      expect(findBannedWords(text)).toEqual([]);
      for (const w of ['性格', '能力', '印象']) expect(text).not.toContain(w);
    }
  });

  it('keeps focus <= 2, practice 5-10 minutes, strengths non-empty', () => {
    for (const c of classifications) for (const f of fixtures) for (const p of profiles) {
      const fb = buildFeedback(c, p, f, 2);
      expect(fb.focus.length).toBeLessThanOrEqual(2);
      expect(fb.strengths.length).toBeGreaterThanOrEqual(1);
      expect(fb.strengths.length).toBeLessThanOrEqual(2);
      const total = fb.practice.reduce((a, s) => a + s.minutes, 0);
      expect(total).toBeGreaterThanOrEqual(5);
      expect(total).toBeLessThanOrEqual(10);
      expect(fb.practice[0].minutes).toBe(2);
      expect(fb.practice[fb.practice.length - 1].minutes).toBe(1);
      expect(fb.sets).toBe(2);
    }
  });

  it('headline strings', () => {
    const p = profiles[0];
    expect(buildFeedback({ kind: 'type', type: 'clear-bright' }, p, strong, 2).headline)
      .toBe('今回の録音では透明感タイプの傾向です');
    expect(buildFeedback({ kind: 'mixed', between: ['clear-bright', 'soft-bright'] }, p, strong, 3).headline)
      .toBe('今回の録音では透明感とふんわり軽やかの中間の傾向です');
    expect(buildFeedback({ kind: 'mixed', between: TYPES }, p, strong, 2).headline)
      .toBe('今回の録音では、いくつかのタイプの中間の傾向です');
    expect(buildFeedback({ kind: 'type', type: 'clear-bright' }, p, strong, 1).headline)
      .toBe('今回の録音では透明感タイプの傾向です(参考・1回)');
  });

  it('marks only a single set as reference', () => {
    const c = classifications[0];
    expect(buildFeedback(c, profiles[0], strong, 1).headline).toContain('参考');
    expect(buildFeedback(c, profiles[0], strong, 2).headline).not.toContain('参考');
    expect(buildFeedback(c, profiles[0], strong, 3).headline).not.toContain('参考');
  });

  it('mentions the Hz range of the dominant band', () => {
    for (const d of [0, 5, 11]) {
      const fb = buildFeedback(classifications[0], profiles[3], fx({ dominant: d }), 2);
      expect(fb.strengths[0]).toContain(`約${BAND_EDGES_HZ[d]}〜${BAND_EDGES_HZ[d + 1]} Hz`);
    }
  });

  it('picks focus by weakness in the specified order', () => {
    const lowClarity: Profile = { brightness: 50, clarity: 30 };
    const fb = buildFeedback(classifications[0], lowClarity, weak, 2);
    expect(fb.focus.length).toBe(2);
    expect(fb.focus[0]).toContain('澄み');
    expect(fb.focus[1]).toContain('抑揚');
    expect(fb.practice.length).toBe(4);
    expect(fb.practice[2].how).toContain('+0.5〜1半音');
    expect(buildFeedback(classifications[0], profiles[0], strong, 2).focus).toEqual([]);
    const speed = buildFeedback(classifications[0], profiles[0], fx({ rate: 9 }), 2);
    expect(speed.focus[0]).toContain('スピード');
    expect(speed.practice.some((s) => s.how.includes('10〜20%'))).toBe(true);
  });

  it('adds a general step when nothing needs focus', () => {
    const fb = buildFeedback(classifications[0], profiles[0], strong, 2);
    expect(fb.practice.map((s) => s.minutes)).toEqual([2, 3, 1]);
    expect(fb.practice[1].title).toBe('のびのび音読');
  });

  it('tells the user to stop if it hurts in every practice step', () => {
    const fb = buildFeedback(classifications[0], profiles[1], weak, 2);
    for (const s of fb.practice) expect(s.how).toContain('痛');
  });
});
