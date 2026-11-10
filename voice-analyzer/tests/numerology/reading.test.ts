import { describe, it, expect } from 'vitest';
import {
  COLOR_THEMES, HEDGE_PHRASES, NUMBER_THEMES, QUESTION_TEMPLATES, READING_DISCLAIMER,
} from '../../src/numerology/copy';
import { buildReading, readingOrNull } from '../../src/numerology/reading';
import { renderReading } from '../../src/ui/screens';
import { forbiddenIn } from '../helpers/forbidden';
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
  it('every number text is hedged; every colour text is framed as the app\'s own metaphor', () => {
    for (const n of LIFES) expect(HEDGE_PHRASES.some((p) => NUMBER_THEMES[n].text.includes(p)), String(n)).toBe(true);
    for (const c of COLORS) {
      expect(COLOR_THEMES[c].text).toContain('にたとえています');
      expect(COLOR_THEMES[c].text).toContain('読み物としての見立て');
      expect(COLOR_THEMES[c].text).not.toContain('語られ');
      expect(COLOR_THEMES[c].text).toContain(`${c}の帯`);
    }
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
    for (const s of allStrings) expect(forbiddenIn(s), s).toEqual([]);
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
    expect(r.disclaimer).toBe('娯楽・自己理解のための読み物です。数秘術にも、声の色の見立てにも、科学的な根拠はありません。声の色の見立ては、このアプリ独自のものです。');
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

describe('rendered card lint', () => {
  const dists = [
    [10, 30, 5, 20, 25, 10], [0, 0, 5, 15, 30, 50], [50, 30, 10, 5, 3, 2], [20, 20, 20, 20, 10, 10], [0, 0, 0, 0, 0, 100],
  ];
  const attrs = (root: Element) =>
    [root, ...Array.from(root.querySelectorAll('*'))].flatMap((n) => Array.from(n.attributes).map((a) => a.value));
  it('has no forbidden word in text or any attribute, for all numbers and several distributions', () => {
    for (const n of LIFES) for (const d of dists) {
      const el = renderReading(buildReading(n, d));
      expect(forbiddenIn(el.textContent ?? ''), `${n} text`).toEqual([]);
      for (const v of attrs(el)) expect(forbiddenIn(v), `${n} attr ${v}`).toEqual([]);
    }
  });
  it('the lint would catch a planted word in an attribute or in the text', () => {
    const el = renderReading(buildReading(9, dists[0]));
    el.querySelector('.reading-number')!.setAttribute('aria-label', '診断');
    el.querySelector('h3')!.setAttribute('title', '健康');
    expect(attrs(el).flatMap(forbiddenIn)).toEqual(['健康', '診断']);
    el.append('性格');
    expect(forbiddenIn(el.textContent ?? '')).toEqual(['性格']);
  });
});
