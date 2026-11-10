import { describe, it, expect } from 'vitest';
import { isValidBirthDate, lifePathNumber, parseBirthDate } from '../../src/numerology/life-path';

const d = (year: number, month: number, day: number) => ({ year, month, day });

describe('lifePathNumber', () => {
  it.each([
    [d(1990, 5, 12), 9],
    [d(2000, 1, 1), 4],
    [d(1985, 10, 2), 8],
    [d(1992, 11, 6), 11], // 29 -> 2+9 = 11 stops
    [d(1980, 12, 1), 22],
    [d(1991, 11, 29), 33],
    [d(1980, 2, 29), 4], // leap day
  ])('%j -> %i', (b, expected) => {
    expect(lifePathNumber(b)).toBe(expected);
  });
  it('is null for invalid dates', () => {
    expect(lifePathNumber(d(2023, 2, 29))).toBeNull();
    expect(lifePathNumber(d(1899, 12, 31))).toBeNull();
    expect(lifePathNumber(d(2999, 1, 1))).toBeNull();
    expect(lifePathNumber(d(1990, 13, 1))).toBeNull();
    expect(lifePathNumber(d(1990, 4, 31))).toBeNull();
    expect(lifePathNumber(d(1990, 1.5, 1))).toBeNull();
  });
  it('only ever returns one of the 12 numbers', () => {
    const ok = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 22, 33]);
    const seen = new Set<number>();
    for (let y = 1950; y <= 2010; y++) for (let m = 1; m <= 12; m++) for (const day of [1, 9, 17, 28]) {
      const n = lifePathNumber(d(y, m, day))!;
      expect(ok.has(n)).toBe(true);
      seen.add(n);
    }
    expect(seen.size).toBe(12);
  });
});

describe('isValidBirthDate', () => {
  const today = new Date(2026, 10, 9);
  it('handles leap years', () => {
    expect(isValidBirthDate(d(2000, 2, 29))).toBe(true);
    expect(isValidBirthDate(d(1900, 2, 29))).toBe(false);
  });
  it('rejects the future but accepts today', () => {
    expect(isValidBirthDate(d(2026, 11, 9), today)).toBe(true);
    expect(isValidBirthDate(d(2026, 11, 10), today)).toBe(false);
    expect(isValidBirthDate(d(2026, 12, 1), today)).toBe(false);
    expect(isValidBirthDate(d(2027, 1, 1), today)).toBe(false);
  });
  it('starts at 1900', () => {
    expect(isValidBirthDate(d(1900, 1, 1))).toBe(true);
    expect(isValidBirthDate(d(1899, 12, 31))).toBe(false);
  });
});

describe('parseBirthDate', () => {
  it('parses a date input value', () => {
    expect(parseBirthDate('1990-05-12')).toEqual(d(1990, 5, 12));
  });
  it('gives null for empty, garbage and invalid dates', () => {
    for (const v of ['', 'abc', '1990-5-12', '1990-13-01', '2023-02-29', '1899-01-01', '2999-01-01']) {
      expect(parseBirthDate(v)).toBeNull();
    }
  });
});
