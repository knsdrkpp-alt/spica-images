import { describe, it, expect } from 'vitest';
import { classify, typeFor, medianProfile } from '../../src/diagnosis/classify';
import { toProfile, type Norms } from '../../src/diagnosis/profile';
import shipped from '../../src/diagnosis/norms.json';
import type { SetFeatures, Profile } from '../../src/types';

const p = (brightness: number, clarity: number): Profile => ({ brightness, clarity });
const ALL4 = ['clear-bright', 'soft-bright', 'clear-calm', 'soft-calm'];

function setWith(alpha: number, cpps: number | null): SetFeatures {
  const base = {
    f0MedianHz: 200, f0RangeSt: 5, f0StabilitySt: 1, cpps: null, hnrDb: 10, h1h2Db: 0,
    alphaRatioDb: 0, centroidHz: 1000, bandShare: new Array(12).fill(1 / 12), voicedSeconds: 3,
  };
  return {
    vowel: base,
    sentence: { ...base, alphaRatioDb: alpha, cpps, articulationRate: 7, speakingRate: 6 },
    flags: { processingOn: false },
  };
}

const norms: Norms = {
  provisional: true,
  groups: {
    female: { alphaRatioDb: { mean: -10, sd: 5 }, cpps: { mean: 10, sd: 2 } },
    male: { alphaRatioDb: { mean: -20, sd: 5 }, cpps: { mean: 12, sd: 2 } },
    all: { alphaRatioDb: { mean: 0, sd: 5 }, cpps: { mean: 8, sd: 2 } },
  },
};

describe('classify', () => {
  it('identical profiles give a type', () => {
    expect(classify([p(80, 80), p(80, 80), p(80, 80)])).toEqual({ kind: 'type', type: 'clear-bright' });
  });
  it('mid brightness is mixed between clear-bright and clear-calm', () => {
    const c = classify([p(50, 80)]);
    expect(c).toEqual({ kind: 'mixed', between: ['clear-bright', 'clear-calm'] });
  });
  it('mid clarity is mixed between bright types', () => {
    expect(classify([p(80, 50)])).toEqual({ kind: 'mixed', between: ['clear-bright', 'soft-bright'] });
  });
  it('set disagreement makes it mixed even when the median is high', () => {
    const c = classify([p(30, 80), p(70, 80), p(70, 80)]);
    expect(c.kind).toBe('mixed');
    if (c.kind === 'mixed') expect(c.between).toEqual(['clear-bright', 'clear-calm']);
  });
  it('both axes mid gives all four types', () => {
    const c = classify([p(50, 50)]);
    expect(c).toEqual({ kind: 'mixed', between: ALL4 });
  });
  it('single profile works', () => {
    expect(classify([p(20, 20)])).toEqual({ kind: 'type', type: 'soft-calm' });
  });
  it('empty array throws', () => {
    expect(() => classify([])).toThrow(Error);
  });
  it('exactly 45 and 55 are mid', () => {
    expect(classify([p(45, 80)]).kind).toBe('mixed');
    expect(classify([p(55, 80)]).kind).toBe('mixed');
    expect(classify([p(55.1, 80)]).kind).toBe('type');
    expect(classify([p(44.9, 80)]).kind).toBe('type');
  });
  it('typeFor covers all combos', () => {
    expect(typeFor(true, true)).toBe('clear-bright');
    expect(typeFor(true, false)).toBe('soft-bright');
    expect(typeFor(false, true)).toBe('clear-calm');
    expect(typeFor(false, false)).toBe('soft-calm');
  });
  it('medianProfile averages the middle two for even counts', () => {
    expect(medianProfile([p(10, 90), p(20, 80), p(40, 60), p(100, 0)])).toEqual({ brightness: 30, clarity: 70 });
  });
  it('medianProfile of odd count is the middle value', () => {
    expect(medianProfile([p(10, 5), p(90, 50), p(20, 7)])).toEqual({ brightness: 20, clarity: 7 });
  });
});

describe('toProfile', () => {
  it('unspecified uses groups.all', () => {
    const pr = toProfile(setWith(0, 8), 'unspecified', norms);
    expect(pr.brightness).toBeCloseTo(50, 3);
    expect(pr.clarity).toBeCloseTo(50, 3);
    const f = toProfile(setWith(0, 8), 'female', norms);
    expect(f.brightness).toBeCloseTo(97.72, 1); // z = +2
    const m = toProfile(setWith(-20, 12), 'male', norms);
    expect(m.brightness).toBeCloseTo(50, 3);
    expect(m.clarity).toBeCloseTo(50, 3);
  });
  it('null cpps gives neutral clarity and finite numbers', () => {
    const pr = toProfile(setWith(-5, null), 'female', norms);
    expect(pr.clarity).toBe(50);
    expect(Number.isFinite(pr.brightness)).toBe(true);
  });
  it('higher alpha ratio gives higher brightness', () => {
    const a = toProfile(setWith(-15, 10), 'female', norms).brightness;
    const b = toProfile(setWith(-5, 10), 'female', norms).brightness;
    expect(b).toBeGreaterThan(a);
  });
  it('sd <= 0 does not produce NaN', () => {
    const n: Norms = { ...norms, groups: { ...norms.groups, all: { alphaRatioDb: { mean: 0, sd: 0 }, cpps: { mean: 0, sd: 0 } } } };
    const pr = toProfile(setWith(3, 3), 'unspecified', n);
    expect(pr.brightness).toBeCloseTo(50, 4);
    expect(pr.clarity).toBeCloseTo(50, 4);
  });
});

describe('shipped norms', () => {
  it('are provisional with sane stats', () => {
    const n = shipped as Norms;
    expect(n.provisional).toBe(true);
    for (const g of ['female', 'male', 'all'] as const) {
      for (const k of ['alphaRatioDb', 'cpps'] as const) {
        expect(Number.isFinite(n.groups[g][k].mean)).toBe(true);
        expect(n.groups[g][k].sd).toBeGreaterThan(0);
      }
    }
  });
});
