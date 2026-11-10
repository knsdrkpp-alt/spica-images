import { SPECTRUM_FLOOR_DB, SPECTRUM_POINTS } from '../dsp/spectrum';
import { BAND_COLORS, BAND_EDGES_HZ } from './config';

export interface ColorBand {
  name: string;
  css: string;
  lowHz: number;
  highHz: number;
}

/** Six colours, LOW to HIGH frequency: the 12 analysis bands merged pairwise. */
export const COLORS_6: ColorBand[] = [
  { name: '赤', css: '#e0242a', lowHz: 100, highHz: 208 },
  { name: '橙', css: '#f28c1b', lowHz: 208, highHz: 431 },
  { name: '黄', css: '#f2d21b', lowHz: 431, highHz: 895 },
  { name: '緑', css: '#2fc24a', lowHz: 895, highHz: 1859 },
  { name: '青', css: '#3f6fe0', lowHz: 1859, highHz: 3860 },
  { name: '紫', css: '#a53fd6', lowHz: 3860, highHz: 8000 },
];

const NAMES_12 = ['赤', '朱', '橙', '黄', '黄緑', '若草', '緑', '水色', '青', '藍', '青紫', '紫'];

/** Twelve colours, LOW to HIGH: the existing BAND_COLORS / BAND_EDGES_HZ. */
export const COLORS_12: ColorBand[] = BAND_COLORS.map((css, i) => ({
  name: NAMES_12[i], css, lowHz: BAND_EDGES_HZ[i], highHz: BAND_EDGES_HZ[i + 1],
}));

export const colorsFor = (bands: 6 | 12): ColorBand[] => (bands === 6 ? COLORS_6 : COLORS_12);

/** Dynamic range (dB below the curve's peak) that counts towards a colour's level. */
export const LEVEL_RANGE_DB = 60;

/**
 * Per-colour level in dB above (peak - 60): the mean over the colour's points of max(0, dB - (peak - 60)).
 * The 240 points split evenly: 40 per colour for 6, 20 for 12. All zeros for a silent curve.
 */
export function colorLevels(curveDb: number[], bands: 6 | 12): number[] {
  const per = SPECTRUM_POINTS / bands;
  const zeros = new Array<number>(bands).fill(0);
  const vals = Array.from({ length: SPECTRUM_POINTS }, (_, i) => {
    const v = curveDb[i];
    return Number.isFinite(v) ? v : SPECTRUM_FLOOR_DB;
  });
  const floorRel = Math.max(...vals) - LEVEL_RANGE_DB;
  if (!(floorRel > SPECTRUM_FLOOR_DB)) return zeros;
  return zeros.map((_, c) => {
    let sum = 0;
    for (let i = c * per; i < (c + 1) * per; i++) sum += Math.max(0, vals[i] - floorRel);
    return sum / per;
  });
}

/** Integer percentages (LOW to HIGH) summing to exactly 100 by largest remainder; ties go to the lower index. */
export function colorShares(curveDb: number[], bands: 6 | 12): number[] {
  const levels = colorLevels(curveDb, bands);
  const total = levels.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return levels.map(() => 0);
  const exact = levels.map((v) => (v / total) * 100);
  const out = exact.map(Math.floor);
  let left = 100 - out.reduce((a, b) => a + b, 0);
  const order = exact
    .map((v, i) => ({ i, r: v - Math.floor(v) }))
    .sort((a, b) => b.r - a.r || a.i - b.i);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) out[order[k].i]++;
  return out;
}

/** Colour names from strongest to weakest share; ties put the higher frequency first. */
export function rankColors(shares: number[], names: string[]): string[] {
  return names
    .map((name, i) => ({ name, i, v: Number.isFinite(shares[i]) ? shares[i] : 0 }))
    .sort((a, b) => b.v - a.v || b.i - a.i)
    .map((x) => x.name);
}

/** Element-wise mean (in dB) of the given curves; missing curves are ignored, none gives the floor. */
export function meanCurveDb(curves: Array<number[] | undefined | null>): number[] {
  const have = curves.filter((c): c is number[] => Array.isArray(c) && c.length === SPECTRUM_POINTS);
  if (!have.length) return new Array<number>(SPECTRUM_POINTS).fill(SPECTRUM_FLOOR_DB);
  return Array.from({ length: SPECTRUM_POINTS }, (_, i) => {
    let s = 0;
    for (const c of have) s += Number.isFinite(c[i]) ? c[i] : SPECTRUM_FLOOR_DB;
    return s / have.length;
  });
}
