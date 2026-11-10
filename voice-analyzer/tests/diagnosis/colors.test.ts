import { describe, it, expect } from 'vitest';
import {
  COLORS_6, COLORS_12, colorLevels, colorShares, meanCurveDb, rankColors,
} from '../../src/diagnosis/colors';
import { BAND_COLORS, BAND_EDGES_HZ } from '../../src/diagnosis/config';

/** A curve with a constant dB value per 40-point (6-colour) block. */
const blocks6 = (vals: number[]) => Array.from({ length: 240 }, (_, i) => vals[Math.floor(i / 40)]);

describe('colour tables', () => {
  it('COLORS_6 runs low to high and merges the 12 band edges pairwise', () => {
    expect(COLORS_6.map((c) => c.name)).toEqual(['赤', '橙', '黄', '緑', '青', '紫']);
    COLORS_6.forEach((c, k) => {
      expect(c.lowHz).toBe(BAND_EDGES_HZ[2 * k]);
      expect(c.highHz).toBe(BAND_EDGES_HZ[2 * k + 2]);
    });
    expect(COLORS_6[0].css).toBe('#e0242a');
    expect(COLORS_6[5].css).toBe('#a53fd6');
  });
  it('COLORS_12 uses the existing band colours and edges', () => {
    expect(COLORS_12.map((c) => c.css)).toEqual(BAND_COLORS);
    expect(COLORS_12[11].highHz).toBe(8000);
    expect(new Set(COLORS_12.map((c) => c.name)).size).toBe(12);
  });
});

describe('colorLevels', () => {
  it('hand-computed example: dB above (peak - 60), clipped at 0, mean per block', () => {
    // peak -10 -> floorRel -70
    const c = blocks6([-10, -40, -70, -100, -20, -55]);
    expect(colorLevels(c, 6)).toEqual([60, 30, 0, 0, 50, 15]);
  });
  it('averages inside a block', () => {
    const c = new Array(240).fill(-120);
    for (let i = 0; i < 20; i++) c[i] = 0; // half of the red block at the peak
    expect(colorLevels(c, 6)[0]).toBeCloseTo(30, 10);
    expect(colorLevels(c, 12)[0]).toBeCloseTo(60, 10);
    expect(colorLevels(c, 12)[1]).toBe(0);
  });
  it('silent curve gives zeros', () => {
    expect(colorLevels(new Array(240).fill(-120), 6)).toEqual(new Array(6).fill(0));
    expect(colorLevels(new Array(240).fill(-170), 12)).toEqual(new Array(12).fill(0));
  });
});

describe('colorShares', () => {
  it('turns the example into integer percentages summing to 100', () => {
    // levels 60,30,0,0,50,15 (total 155): 38.71 19.35 0 0 32.26 9.68 -> floors 38 19 0 0 32 9 (98)
    // remainders .71 .35 .26 .68 -> +1 to red and violet
    const s = colorShares(blocks6([-10, -40, -70, -100, -20, -55]), 6);
    expect(s).toEqual([39, 19, 0, 0, 32, 10]);
  });
  it('always sums to exactly 100; equal thirds break ties toward the lower index', () => {
    const s = colorShares(blocks6([0, 0, 0, -200, -200, -200]), 6);
    expect(s).toEqual([34, 33, 33, 0, 0, 0]);
    const flat = colorShares(new Array(240).fill(-30), 12);
    expect(flat.reduce((a, b) => a + b, 0)).toBe(100);
    expect(flat).toEqual([9, 9, 9, 9, 8, 8, 8, 8, 8, 8, 8, 8]);
  });
  it('12-colour mode has 12 values', () => {
    const c = Array.from({ length: 240 }, (_, i) => -i / 4);
    const s = colorShares(c, 12);
    expect(s).toHaveLength(12);
    expect(s.reduce((a, b) => a + b, 0)).toBe(100);
    expect(s[0]).toBeGreaterThan(s[11]);
  });
  it('zero input gives zeros, never NaN', () => {
    expect(colorShares(new Array(240).fill(-120), 6)).toEqual(new Array(6).fill(0));
    const nan = colorShares(new Array(240).fill(Number.NaN), 6);
    expect(nan.every(Number.isFinite)).toBe(true);
  });
});

describe('rankColors', () => {
  it('orders strongest first; ties put the higher frequency first', () => {
    const names = COLORS_6.map((c) => c.name);
    expect(rankColors([22, 10, 7, 18, 13, 30], names)).toEqual(['紫', '赤', '緑', '青', '橙', '黄']);
    expect(rankColors([20, 20, 20, 20, 10, 10], names)).toEqual(['緑', '黄', '橙', '赤', '紫', '青']);
  });
});

describe('meanCurveDb', () => {
  it('averages element-wise in dB and ignores missing curves', () => {
    const a = new Array(240).fill(-20);
    const b = new Array(240).fill(-40);
    expect(meanCurveDb([a, undefined, b])).toEqual(new Array(240).fill(-30));
  });
  it('empty input gives the floor', () => {
    expect(meanCurveDb([])).toEqual(new Array(240).fill(-120));
    expect(meanCurveDb([undefined])).toEqual(new Array(240).fill(-120));
  });
});
