import type { Profile, SetFeatures, VoiceType } from '../types';
import type { Classification } from './classify';
import { BAND_EDGES_HZ } from './config';
import {
  ALLOWED_FIXED_COPY, BANNED_WORDS, FOCUS, FOCUS_STEP, GENERAL_STEP, STRENGTH_BRIGHTNESS,
  STRENGTH_CLARITY, TENDENCY_MIXED_ALL, TENDENCY_NOTE, TRANSFER, TYPE_DESCRIPTION,
  TYPE_LABEL, WARMUP,
} from './copy';

export { FIXED_FOOTER, STOP_NOTICE, TYPE_LABEL } from './copy';

export interface PracticeStep {
  title: string;
  minutes: number;
  how: string;
}

export interface Feedback {
  headline: string;
  tendency: string;
  strengths: string[];
  focus: string[];
  practice: PracticeStep[];
  sets: number;
}

export function findBannedWords(text: string): string[] {
  let rest = text;
  for (const allowed of ALLOWED_FIXED_COPY) rest = rest.split(allowed).join('');
  return BANNED_WORDS.filter((w) => rest.includes(w));
}

function headlineFor(c: Classification, sets: number): string {
  let core: string;
  if (c.kind === 'type') core = `今回の録音では${TYPE_LABEL[c.type]}タイプの傾向です`;
  else if (c.between.length === 2) {
    core = `今回の録音では${TYPE_LABEL[c.between[0]]}と${TYPE_LABEL[c.between[1]]}の中間の傾向です`;
  } else core = '今回の録音では、いくつかのタイプの中間の傾向です';
  return sets === 1 ? `${core}(参考・1回)` : core;
}

function tendencyFor(c: Classification): string {
  let body: string;
  if (c.kind === 'type') body = TYPE_DESCRIPTION[c.type];
  else if (c.between.length === 2) {
    const [a, b]: VoiceType[] = c.between;
    body = `${TYPE_LABEL[a]}寄りの面と${TYPE_LABEL[b]}寄りの面があります。${TYPE_DESCRIPTION[a]}一方で、${TYPE_DESCRIPTION[b]}`;
  } else body = TENDENCY_MIXED_ALL;
  return `${body}${TENDENCY_NOTE}`;
}

function strengthsFor(profile: Profile, last: SetFeatures): string[] {
  const share = last.sentence.bandShare;
  let top = 0;
  for (let i = 1; i < share.length; i++) if (share[i] > share[top]) top = i;
  const out = [`いちばん強い帯域は約${BAND_EDGES_HZ[top]}〜${BAND_EDGES_HZ[top + 1]} Hz です。`];
  if (profile.clarity > 55) out.push(STRENGTH_CLARITY);
  if (profile.brightness > 55) out.push(STRENGTH_BRIGHTNESS);
  return out.slice(0, 2);
}

type FocusKey = keyof typeof FOCUS;

function focusKeys(profile: Profile, last: SetFeatures): FocusKey[] {
  const { sentence, vowel } = last;
  const keys: FocusKey[] = [];
  if (profile.clarity < 45 || sentence.cpps === null) keys.push('clarity');
  if (sentence.f0RangeSt !== null && sentence.f0RangeSt < 3) keys.push('intonation');
  if (vowel.f0StabilitySt !== null && vowel.f0StabilitySt > 0.5) keys.push('stability');
  const r = sentence.articulationRate;
  if (r > 0 && (r > 8 || r < 5)) keys.push('speed');
  return keys.slice(0, 2);
}

export function buildFeedback(
  c: Classification, profile: Profile, last: SetFeatures, sets: number,
): Feedback {
  const keys = focusKeys(profile, last);
  const practice: PracticeStep[] = [{ ...WARMUP, minutes: 2 }];
  if (keys.length === 0) practice.push({ ...GENERAL_STEP, minutes: 3 });
  for (const k of keys) practice.push({ ...FOCUS_STEP[k], minutes: 3 });
  practice.push({ ...TRANSFER, minutes: 1 });
  return {
    headline: headlineFor(c, sets),
    tendency: tendencyFor(c),
    strengths: strengthsFor(profile, last),
    focus: keys.map((k) => FOCUS[k]),
    practice,
    sets,
  };
}
