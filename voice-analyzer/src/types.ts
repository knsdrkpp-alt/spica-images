export type Sex = 'female' | 'male' | 'unspecified';

/** F0 track. f0 in Hz, null for unvoiced frames. */
export interface PitchTrack {
  hopSeconds: number;
  f0: Array<number | null>;
  clarity: number[];
}

export interface TaskFeatures {
  f0MedianHz: number | null;
  f0RangeSt: number | null;
  f0StabilitySt: number | null;
  cpps: number | null;
  hnrDb: number | null;
  h1h2Db: number | null;
  alphaRatioDb: number;
  centroidHz: number;
  /** length 12, sums to 1 */
  bandShare: number[];
  voicedSeconds: number;
}

export interface SentenceFeatures extends TaskFeatures {
  /** morae per second */
  articulationRate: number;
  /** morae per second */
  speakingRate: number;
}

export interface SetFeatures {
  vowel: TaskFeatures;
  sentence: SentenceFeatures;
  flags: { processingOn: boolean };
}

export type VoiceType = 'clear-bright' | 'soft-bright' | 'clear-calm' | 'soft-calm';

/** Within-sex percentiles, 0 to 100. */
export interface Profile {
  brightness: number;
  clarity: number;
}
