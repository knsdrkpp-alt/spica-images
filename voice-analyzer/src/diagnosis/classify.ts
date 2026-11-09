import { MID_BAND } from './config';
import type { Profile, VoiceType } from '../types';

export type Classification =
  | { kind: 'type'; type: VoiceType }
  | { kind: 'mixed'; between: [VoiceType, VoiceType] | [VoiceType, VoiceType, VoiceType, VoiceType] };

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function medianProfile(profiles: Profile[]): Profile {
  return {
    brightness: median(profiles.map((p) => p.brightness)),
    clarity: median(profiles.map((p) => p.clarity)),
  };
}

export function typeFor(brightHigh: boolean, clearHigh: boolean): VoiceType {
  if (brightHigh) return clearHigh ? 'clear-bright' : 'soft-bright';
  return clearHigh ? 'clear-calm' : 'soft-calm';
}

/** Side of one axis: true = high, false = low, null = ambiguous (mid band or sets disagree). */
function side(values: number[]): boolean | null {
  const m = median(values);
  if (m >= MID_BAND[0] && m <= MID_BAND[1]) return null;
  const anyLow = values.some((v) => v < MID_BAND[0]);
  const anyHigh = values.some((v) => v > MID_BAND[1]);
  if (anyLow && anyHigh) return null;
  return m > MID_BAND[1];
}

export function classify(profiles: Profile[]): Classification {
  if (profiles.length === 0) throw new Error('classify: no profiles');
  const b = side(profiles.map((p) => p.brightness));
  const c = side(profiles.map((p) => p.clarity));
  if (b !== null && c !== null) return { kind: 'type', type: typeFor(b, c) };
  if (b === null && c === null) {
    return { kind: 'mixed', between: ['clear-bright', 'soft-bright', 'clear-calm', 'soft-calm'] };
  }
  if (b === null) {
    return { kind: 'mixed', between: [typeFor(true, c!), typeFor(false, c!)] };
  }
  return { kind: 'mixed', between: [typeFor(b, true), typeFor(b, false)] };
}
