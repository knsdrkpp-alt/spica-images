/**
 * Writes the synthetic golden voices (tests/golden/cases.ts) as 16-bit PCM mono WAVs.
 * SYNTHETIC ONLY - these are not human recordings.
 *
 *   npx tsx scripts/make-synthetic-wavs.ts [out-dir=tests/golden/wav]
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { GOLDEN_CASES } from '../tests/golden/cases';
import { harmonicTone } from '../tests/helpers/synth';
import { writeWav } from './wav';

const outDir = process.argv[2] ?? 'tests/golden/wav';
mkdirSync(outDir, { recursive: true });
for (const c of GOLDEN_CASES) {
  writeFileSync(join(outDir, `${c.id}.wav`), writeWav(harmonicTone(c.params), c.params.sampleRate));
}
console.log(`wrote ${GOLDEN_CASES.length} synthetic WAVs to ${outDir}`);
