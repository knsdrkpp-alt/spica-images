/**
 * Build src/diagnosis/norms.json.
 *   npx tsx scripts/build-norms.ts --synthetic
 *   npx tsx scripts/build-norms.ts <dir> --sex female|male|all [--final]
 */
import { readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractSentence } from '../src/dsp/features';
import { harmonicTone } from '../tests/helpers/synth';
import { parseWav } from './wav';
import type { GroupNorms, Norms } from '../src/diagnosis/profile';
import type { SentenceFeatures } from '../src/types';

const OUT = resolve(dirname(fileURLToPath(import.meta.url)), '../src/diagnosis/norms.json');

function stats(xs: number[]): { mean: number; sd: number } {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, xs.length - 1));
  return { mean, sd };
}

function groupStats(fs: SentenceFeatures[]): GroupNorms {
  return {
    alphaRatioDb: stats(fs.map((f) => f.alphaRatioDb)),
    cpps: stats(fs.flatMap((f) => (f.cpps === null ? [] : [f.cpps]))),
  };
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function synthGroup(f0Lo: number, f0Hi: number, seedBase: number): SentenceFeatures[] {
  const n = 50;
  const out: SentenceFeatures[] = [];
  for (let i = 0; i < n; i++) {
    // Deterministic low-discrepancy spread so the three axes are not perfectly correlated.
    const t = (i + 0.5) / n;
    const u = (i * 0.618033988749895) % 1;
    const w = (i * 0.754877666246693) % 1;
    const samples = harmonicTone({
      f0: lerp(f0Lo, f0Hi, t),
      seconds: 8,
      sampleRate: 16000,
      tiltDbPerOctave: lerp(-18, -6, u),
      noiseDb: lerp(-30, -8, w),
      seed: seedBase + i,
    });
    out.push(extractSentence(samples, 16000));
  }
  return out;
}

function readNorms(): Norms | null {
  return existsSync(OUT) ? (JSON.parse(readFileSync(OUT, 'utf8')) as Norms) : null;
}

function write(n: Norms): void {
  writeFileSync(OUT, JSON.stringify(n, null, 2) + '\n');
  console.log(`wrote ${OUT}`);
}

function main(): void {
  const args = process.argv.slice(2);
  if (args.includes('--synthetic')) {
    const female = synthGroup(160, 260, 1000);
    const male = synthGroup(85, 150, 2000);
    write({
      provisional: true,
      groups: { female: groupStats(female), male: groupStats(male), all: groupStats([...female, ...male]) },
    });
    return;
  }
  const dir = args.find((a) => !a.startsWith('--'));
  const si = args.indexOf('--sex');
  const sex = si >= 0 ? args[si + 1] : undefined;
  if (!dir || (sex !== 'female' && sex !== 'male' && sex !== 'all')) {
    console.error('usage: build-norms.ts --synthetic | <dir> --sex female|male|all [--final]');
    process.exit(1);
  }
  const files = readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.wav'));
  if (files.length < 2) {
    console.error('need at least 2 WAV files');
    process.exit(1);
  }
  const feats = files.map((f) => {
    const { samples, sampleRate } = parseWav(new Uint8Array(readFileSync(join(dir, f))));
    return extractSentence(samples, sampleRate);
  });
  const cur = readNorms();
  if (!cur) {
    console.error('norms.json missing; run --synthetic first');
    process.exit(1);
  }
  cur.groups[sex] = groupStats(feats);
  if (args.includes('--final')) cur.provisional = false;
  write(cur);
}

main();
