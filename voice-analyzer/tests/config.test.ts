import { describe, expect, it } from 'vitest';
import {
  BAND_COLORS,
  BAND_EDGES_HZ,
  READING_KANA,
  READING_MORAE,
  countMorae,
} from '../src/diagnosis/config';
import { harmonicTone } from './helpers/synth';

describe('config', () => {
  it('has 13 ascending band edges from 100 to 8000 and 12 colors', () => {
    expect(BAND_EDGES_HZ).toHaveLength(13);
    expect(BAND_EDGES_HZ[0]).toBe(100);
    expect(BAND_EDGES_HZ[12]).toBe(8000);
    for (let i = 1; i < 13; i++) expect(BAND_EDGES_HZ[i]).toBeGreaterThan(BAND_EDGES_HZ[i - 1]);
    expect(BAND_COLORS).toHaveLength(12);
    expect(new Set(BAND_COLORS).size).toBe(12);
  });

  it('counts morae', () => {
    expect(countMorae('きたかぜとたいようがちからくらべをしていました')).toBe(23);
    expect(countMorae('きょうは、がっこう。')).toBe(7);
    expect(countMorae('ラーメン')).toBe(4);
    expect(countMorae(READING_KANA)).toBe(READING_MORAE);
  });
});

describe('harmonicTone', () => {
  it('returns one second of bounded samples', () => {
    const x = harmonicTone({ f0: 200, seconds: 1, sampleRate: 16000 });
    expect(x.length).toBe(16000);
    let peak = 0;
    for (const v of x) peak = Math.max(peak, Math.abs(v));
    expect(peak).toBeLessThanOrEqual(1);
    expect(peak).toBeGreaterThan(0.1);
  });
});
