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

/** Recording quality gate thresholds. Provisional; to be tuned with real recordings. */
export const GATE = {
  /** SNR (dB) at or above which no noise warning is raised. */
  snrOkDb: 30,
  /**
   * SNR (dB) below which the recording is rejected as too noisy. Provisional (no cited source):
   * lowered from 25 after a real-device report that a quiet room was rejected every time;
   * 20 to 30 dB is accepted with a warning. Tune with real recordings.
   */
  snrRejectDb: 20,
  /** Pre-roll noise floor (dBFS) above which a 'noise-borderline' warning is raised. */
  noiseFloorMaxDbfs: -50,
  /** Maximum fraction of samples with |x| >= 0.99. */
  clipRatioMax: 0.001,
  /** Reject when this many consecutive samples have |x| >= 0.99. */
  clipRunMax: 3,
  /** Documented target peak range (dBFS); not enforced. */
  peakTargetDbfs: [-20, -3] as readonly [number, number],
  /** Peak (dBFS) below which the recording is rejected as too quiet; below peakTarget[0] warns. */
  peakQuietDbfs: -30,
  vowelStableMinSeconds: 3,
  /** Maximum F0 standard deviation (cent) for a sustained vowel. */
  vowelFlatnessSdCentMax: 50,
  /** Not enforced in v1: no feature carries level variation yet. */
  vowelLevelVarDbMax: 6,
} as const;
