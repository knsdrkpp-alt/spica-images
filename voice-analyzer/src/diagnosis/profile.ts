import type { Profile, SetFeatures, Sex } from '../types';

export interface GroupNorms {
  alphaRatioDb: { mean: number; sd: number };
  cpps: { mean: number; sd: number };
}

export interface Norms {
  provisional: boolean;
  groups: Record<'female' | 'male' | 'all', GroupNorms>;
}

/** Abramowitz-Stegun 7.1.26 erf approximation (max error ~1.5e-7). */
function erf(x: number): number {
  const s = x < 0 ? -1 : 1;
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const poly = ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  return s * (1 - poly * Math.exp(-a * a));
}

/** Percentile (0-100) of value under N(mean, sd). sd <= 0 or non-finite input is treated as z = 0. */
export function percentile(value: number, mean: number, sd: number): number {
  const z = sd > 0 && Number.isFinite(value) ? (value - mean) / sd : 0;
  return 100 * 0.5 * (1 + erf(z / Math.SQRT2));
}

export function toProfile(set: SetFeatures, sex: Sex, norms: Norms): Profile {
  const g = norms.groups[sex === 'unspecified' ? 'all' : sex];
  const s = set.sentence;
  const brightness = percentile(s.alphaRatioDb, g.alphaRatioDb.mean, g.alphaRatioDb.sd);
  // No CPPS (too few voiced frames): neutral clarity rather than NaN.
  const clarity = s.cpps === null ? 50 : percentile(s.cpps, g.cpps.mean, g.cpps.sd);
  return { brightness, clarity };
}
