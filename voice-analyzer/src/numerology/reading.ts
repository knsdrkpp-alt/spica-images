import { COLORS_6, rankColors } from '../diagnosis/colors';
import {
  COLOR_THEMES, NUMBER_THEMES, QUESTION_TEMPLATES, READING_DISCLAIMER, type ColorName,
} from './copy';
import type { LifePath } from './life-path';

export { NUMBER_THEMES, COLOR_THEMES, READING_DISCLAIMER };
export type { ColorName };

export interface ColorReading { name: string; share: number; title: string; text: string }

export interface Reading {
  life: LifePath;
  numberTitle: string;
  numberText: string;
  strongest: ColorReading;
  weakest: ColorReading;
  questions: string[];
  disclaimer: string;
}

const NAMES = COLORS_6.map((c) => c.name as ColorName);

function colorReading(name: ColorName, shares: number[]): ColorReading {
  const share = shares[NAMES.indexOf(name)];
  return { name, share: Number.isFinite(share) ? share : 0, ...COLOR_THEMES[name] };
}

/**
 * `colorShares6` is colorShares(sentenceCurve, 6), LOW to HIGH (赤…紫). The strongest colour is the
 * first of rankColors (ties: higher frequency first), the weakest is its last entry.
 */
export function buildReading(life: LifePath, colorShares6: number[]): Reading {
  const ranked = rankColors(colorShares6, NAMES) as ColorName[];
  const strongest = colorReading(ranked[0], colorShares6);
  const weakest = colorReading(ranked[ranked.length - 1], colorShares6);
  const theme = NUMBER_THEMES[life];
  const fill = (t: string) => t
    .replace('{numberTitle}', theme.title)
    .replace('{strongestTitle}', strongest.title)
    .replace('{strongest}', strongest.name)
    .replace('{weakestTitle}', weakest.title)
    .replace('{weakest}', weakest.name);
  return {
    life,
    numberTitle: theme.title,
    numberText: theme.text,
    strongest,
    weakest,
    questions: QUESTION_TEMPLATES.map(fill),
    disclaimer: READING_DISCLAIMER,
  };
}

/** No birth date, or a recording without a usable spectrum (all shares zero): no reading at all. */
export function readingOrNull(life: LifePath | null, colorShares6: number[]): Reading | null {
  if (life === null) return null;
  if (!colorShares6.some((v) => Number.isFinite(v) && v > 0)) return null;
  return buildReading(life, colorShares6);
}
