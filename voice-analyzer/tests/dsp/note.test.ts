import { describe, expect, it } from 'vitest';
import { hzToNoteName } from '../../src/dsp/note';

describe('hzToNoteName', () => {
  it.each([
    [440, 'A4'],
    [261.63, 'C4'],
    [100, 'G2'],
    [220, 'A3'],
    [110, 'A2'],
    [196, 'G3'],
    [277.18, 'C#4'],
    [880, 'A5'],
    [32.7, 'C1'],
  ])('%f Hz -> %s', (hz, name) => {
    expect(hzToNoteName(hz)).toBe(name);
  });
  it('rounds to the nearest semitone (B3/C4 boundary)', () => {
    expect(hzToNoteName(254)).toBe('B3'); // ~ -49 cents below C4
    expect(hzToNoteName(255)).toBe('C4'); // ~ -42 cents below C4
  });
  it('returns null for invalid input', () => {
    for (const x of [0, -1, NaN, Infinity]) expect(hzToNoteName(x)).toBeNull();
  });
});
