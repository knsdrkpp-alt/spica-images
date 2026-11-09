/**
 * Synthetic voices for the Parselmouth (Praat) golden regression.
 *
 * SYNTHETIC ONLY: no real human recordings exist yet. The same parameter list drives
 * `scripts/make-synthetic-wavs.ts` (writes 16-bit WAVs for Praat) and `golden.test.ts`
 * (regenerates the identical samples in-process, including the 16-bit quantization).
 */
import type { HarmonicToneOptions } from '../helpers/synth';

export interface GoldenCase {
  id: string;
  params: HarmonicToneOptions;
}

const F0S = [110, 200];
const NOISES: Array<number | undefined> = [undefined, -25, -15, -8];
const TILTS = [-6, -12];
const RATES = [16000, 48000];

function build(): GoldenCase[] {
  const out: GoldenCase[] = [];
  let seed = 1000;
  for (const f0 of F0S)
    for (const noiseDb of NOISES)
      for (const tilt of TILTS)
        for (const sampleRate of RATES) {
          seed++;
          const id = `f${f0}_n${noiseDb === undefined ? 'none' : -noiseDb}_t${-tilt}_sr${sampleRate / 1000}k`;
          out.push({
            id,
            params: {
              f0,
              seconds: 4,
              sampleRate,
              harmonics: f0 === 110 ? 20 : 15,
              tiltDbPerOctave: tilt,
              noiseDb,
              seed,
            },
          });
        }
  return out;
}

export const GOLDEN_CASES: readonly GoldenCase[] = build();
