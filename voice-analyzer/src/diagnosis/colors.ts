import { SPECTRUM_FLOOR_DB, SPECTRUM_POINTS } from '../dsp/spectrum';
import { BAND_COLORS, BAND_EDGES_HZ } from './config';

export interface ColorBand {
  name: string;
  /** One-character form for tight labels (12-colour bar chart). */
  shortName: string;
  css: string;
  lowHz: number;
  highHz: number;
}

/** Six colours, LOW to HIGH frequency: the 12 analysis bands merged pairwise. */
export const COLORS_6: ColorBand[] = [
  { name: '赤', shortName: '赤', css: '#e0242a', lowHz: 100, highHz: 208 },
  { name: '橙', shortName: '橙', css: '#f28c1b', lowHz: 208, highHz: 431 },
  { name: '黄', shortName: '黄', css: '#f2d21b', lowHz: 431, highHz: 895 },
  { name: '緑', shortName: '緑', css: '#2fc24a', lowHz: 895, highHz: 1859 },
  { name: '青', shortName: '青', css: '#3f6fe0', lowHz: 1859, highHz: 3860 },
  { name: '紫', shortName: '紫', css: '#a53fd6', lowHz: 3860, highHz: 8000 },
];

const NAMES_12 = ['赤', '朱', '橙', '黄', '黄緑', '若草', '緑', '水色', '青', '藍', '青紫', '紫'];
/** 萌 = 萌黄 (yellow-green), 若 = 若草, 水 = 水色, 菫 = 菫色 (blue-violet). */
const SHORT_12 = ['赤', '朱', '橙', '黄', '萌', '若', '緑', '水', '青', '藍', '菫', '紫'];

/** Twelve colours, LOW to HIGH: the existing BAND_COLORS / BAND_EDGES_HZ. */
export const COLORS_12: ColorBand[] = BAND_COLORS.map((css, i) => ({
  name: NAMES_12[i], shortName: SHORT_12[i], css, lowHz: BAND_EDGES_HZ[i], highHz: BAND_EDGES_HZ[i + 1],
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

/** Darkest (edge) and lightest (centre) colours of the dark graph cards. */
export const DARK_CARD_BG = ['#07122e', '#0f2a5e'];

function rgb(css: string): [number, number, number] {
  const h = css.replace('#', '');
  return [0, 2, 4].map((o) => parseInt(h.slice(o, o + 2), 16)) as [number, number, number];
}

/** WCAG 2 relative luminance of a #rrggbb colour. */
export function luminance(css: string): number {
  const [r, g, b] = rgb(css).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio of two #rrggbb colours. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT_CONTRAST = 4.6; // 4.5:1 plus a small margin

/**
 * A tint of the colour for TEXT on the dark cards: mixed toward white just enough to reach 4.5:1
 * against every card background colour. Colours that already pass are returned unchanged.
 */
export function lightenForDark(css: string): string {
  const base = rgb(css);
  for (let t = 0; t <= 1.0001; t += 0.02) {
    const hex = '#' + base.map((v) => Math.round(v + (255 - v) * Math.min(1, t)).toString(16).padStart(2, '0')).join('');
    if (DARK_CARD_BG.every((bg) => contrastRatio(hex, bg) >= TEXT_CONTRAST)) return hex;
  }
  return '#ffffff';
}
