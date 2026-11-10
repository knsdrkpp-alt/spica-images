import { describe, it, expect } from 'vitest';
import {
  BANNED_WORDS,
} from '../../src/diagnosis/copy';
import {
  COLOR_THEMES, EXTRA_BANNED_STEMS, HEDGE_PHRASES, NUMBER_THEMES, QUESTION_TEMPLATES, READING_DISCLAIMER,
} from '../../src/numerology/copy';
import { buildReading, readingOrNull } from '../../src/numerology/reading';
import type { LifePath } from '../../src/numerology/life-path';

const LIFES: LifePath[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 22, 33];
const COLORS = ['赤', '橙', '黄', '緑', '青', '紫'] as const;
const themes = [
  ...LIFES.map((n) => ({ key: String(n), ...NUMBER_THEMES[n] })),
  ...COLORS.map((c) => ({ key: c, ...COLOR_THEMES[c] })),
];
const allStrings = [
  ...themes.flatMap((t) => [t.title, t.text]), READING_DISCLAIMER, ...QUESTION_TEMPLATES,
];

describe('themes', () => {
  it('has a theme for every number and colour', () => {
    expect(Object.keys(NUMBER_THEMES).sort()).toEqual(LIFES.map(String).sort());
    expect(Object.keys(COLOR_THEMES).sort()).toEqual([...COLORS].sort());
    for (const t of themes) {
      expect(t.title.length).toBeGreaterThan(1);
      expect(t.text.length).toBeGreaterThan(40);
    }
  });
  it('every text is hedged', () => {
    for (const t of themes) expect(HEDGE_PHRASES.some((p) => t.text.includes(p)), t.key).toBe(true);
  });
  it('number texts are attributed to numerology and give 3 or 4 sentences', () => {
    for (const n of LIFES) {
      expect(NUMBER_THEMES[n].text.startsWith('数秘術では、')).toBe(true);
      const sentences = NUMBER_THEMES[n].text.split('。').filter(Boolean).length;
      expect(sentences).toBeGreaterThanOrEqual(3);
      expect(sentences).toBeLessThanOrEqual(4);
    }
  });
  it('colour texts are framed as a reading and give 2 or 3 sentences', () => {
    for (const c of COLORS) {
      expect(COLOR_THEMES[c].text.startsWith('読み物としての見立てです。')).toBe(true);
      const sentences = COLOR_THEMES[c].text.split('。').filter(Boolean).length;
      expect(sentences).toBeGreaterThanOrEqual(3); // framing sentence + 2
      expect(sentences).toBeLessThanOrEqual(4);
    }
  });
  it('contains no banned words, banned stems or verdict / health / money / love / fortune wording', () => {
    const forbidden = [
      ...BANNED_WORDS, ...EXTRA_BANNED_STEMS,
      'あなた', 'になります', 'です。あなた', '本当の自分', '本質', '健康', '病', 'お金', '金運', '収入', '稼', '恋', '結婚', '運命', '幸運', '開運', '寿命', '成功', '必ず',
    ];
    for (const s of allStrings) for (const w of forbidden) expect(s.includes(w), `${w} in ${s}`).toBe(false);
  });
});

describe('buildReading', () => {
  const shares = [10, 30, 5, 20, 25, 10]; // strongest 橙, weakest 黄
  it('picks strongest and weakest and carries their themes', () => {
    const r = buildReading(9, shares);
    expect(r.life).toBe(9);
    expect(r.numberTitle).toBe(NUMBER_THEMES[9].title);
    expect(r.numberText).toBe(NUMBER_THEMES[9].text);
    expect(r.strongest).toEqual({ name: '橙', share: 30, ...COLOR_THEMES.橙 });
    expect(r.weakest).toEqual({ name: '黄', share: 5, ...COLOR_THEMES.黄 });
    expect(r.disclaimer).toBe('娯楽・自己理解のための読み物です。科学的な根拠は確認されていません。');
  });
  it('ties: strongest is the higher frequency, weakest is the last of the ranking', () => {
    const r = buildReading(4, [20, 20, 20, 20, 10, 10]);
    expect(r.strongest.name).toBe('緑');
    expect(r.weakest.name).toBe('青'); // ranking 緑 黄 橙 赤 紫 青: the 10/10 tie puts 紫 first, 青 last
  });
  it('has exactly 3 questions that contain the actual titles', () => {
    for (const n of LIFES) {
      const r = buildReading(n, shares);
      expect(r.questions).toHaveLength(3);
      expect(r.questions[0]).toContain(`「${r.numberTitle}」`);
      expect(r.questions[0]).toContain(`${r.strongest.name}の帯の見立て「${r.strongest.title}」`);
      expect(r.questions[1]).toContain(`${r.weakest.name}の帯の見立て「${r.weakest.title}」`);
      for (const q of r.questions) expect(q).not.toMatch(/[{}]/);
    }
  });
});

describe('readingOrNull', () => {
  it('is null without a life path number or with all-zero shares', () => {
    expect(readingOrNull(null, [10, 20, 20, 20, 20, 10])).toBeNull();
    expect(readingOrNull(9, [0, 0, 0, 0, 0, 0])).toBeNull();
  });
  it('gives a reading otherwise', () => {
    expect(readingOrNull(9, [0, 0, 0, 0, 0, 100])!.strongest.name).toBe('紫');
  });
});
