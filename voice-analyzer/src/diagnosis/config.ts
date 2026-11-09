/** 12 log-spaced analysis bands, 100 Hz to 8 kHz. */
export const BAND_EDGES_HZ: number[] = [
  100, 144, 208, 299, 431, 621, 895, 1290, 1859, 2679, 3860, 5563, 8000,
];

/** One color per band, red (low) to violet (high). */
export const BAND_COLORS: string[] = [
  '#e53935', '#f4511e', '#fb8c00', '#fdd835', '#c0ca33', '#7cb342',
  '#43a047', '#00acc1', '#1e88e5', '#3949ab', '#5e35b1', '#8e24aa',
];

export const YIN_THRESHOLD = 0.12;
export const F0_RANGE_HZ = [60, 500];
export const MID_BAND = [45, 55];

export const READING_TEXT =
  '北風と太陽が力比べをしていました。旅人の外套を脱がせた方が勝ちだと決めました。';
export const READING_KANA =
  'きたかぜとたいようがちからくらべをしていました。たびびとのがいとうをぬがせたほうがかちだときめました。';
export const READING_MORAE = 49;

const SMALL_KANA = new Set('ゃゅょャュョ');
const IGNORED = /[\s。、，．,.！!？?「」『』（）()・…〜~]/;

/** Count morae in kana text. Small ゃゅょ join the previous kana; っ ー ん count one each. */
export function countMorae(kana: string): number {
  let n = 0;
  for (const ch of kana) {
    if (IGNORED.test(ch) || SMALL_KANA.has(ch)) continue;
    n++;
  }
  return n;
}
