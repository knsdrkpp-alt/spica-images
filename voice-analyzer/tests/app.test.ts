import { describe, it, expect, vi, afterEach } from 'vitest';
import { App, REST_SECONDS, SENTENCE_MAX_SECONDS, VOWEL_SECONDS } from '../src/app';
import type { Recorder, MicError } from '../src/audio/capture';
import norms from '../src/diagnosis/norms.json';
import type { Norms } from '../src/diagnosis/profile';
import { harmonicTone, silence } from './helpers/synth';

// Pass-through spy: records what the screen showed when the (synchronous, slow) analysis started.
const probe = vi.hoisted(() => ({ textAtExtractSentence: [] as string[] }));
vi.mock('../src/dsp/features', async (importOriginal) => {
  const orig = await importOriginal<typeof import('../src/dsp/features')>();
  return {
    ...orig,
    extractSentence: (...args: Parameters<typeof orig.extractSentence>) => {
      probe.textAtExtractSentence.push(document.getElementById('app')?.textContent ?? '');
      return orig.extractSentence(...args);
    },
  };
});

const SR = 16000;
type Rec = { samples: Float32Array; preRoll: Float32Array };

function concat(parts: Float32Array[]): Float32Array {
  const out = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

function goodVowel(): Rec {
  return {
    preRoll: silence(0.5, SR),
    samples: harmonicTone({ f0: 200, seconds: 5, sampleRate: SR, harmonics: 10 }),
  };
}

function goodSentence(): Rec {
  const parts: Float32Array[] = [];
  for (let i = 0; i < 20; i++) {
    parts.push(harmonicTone({ f0: 180 + (i % 5) * 10, seconds: 0.15 + (i % 3) * 0.1, sampleRate: SR, harmonics: 10 }));
    parts.push(silence(0.05 + (i % 3) * 0.025, SR));
  }
  return { preRoll: silence(0.5, SR), samples: concat(parts) };
}

/** A slow starter: silent for 1.3 s, then 「あー」 until the end of the 6.5 s recording. */
function lateOnsetVowel(): Rec {
  return {
    preRoll: silence(0.5, SR),
    samples: concat([
      silence(1.3, SR),
      harmonicTone({ f0: 200, seconds: VOWEL_SECONDS - 1.3, sampleRate: SR, harmonics: 10 }),
    ]),
  };
}

function silentVowel(): Rec {
  return { preRoll: silence(0.5, SR), samples: silence(5, SR) };
}

function fakeRecorder(script: Array<() => Promise<Rec> | Rec>) {
  const rec = {
    sampleRate: SR,
    processingOn: false,
    onInterrupted: null as (() => void) | null,
    start: vi.fn(async (_cb: unknown) => {}),
    stop: vi.fn(async () => {
      const next = script.shift();
      if (!next) throw new Error('script exhausted');
      return next();
    }),
    discard: vi.fn(),
    release: vi.fn(),
  };
  return rec;
}

const flush = async () => { for (let i = 0; i < 40; i++) await new Promise((r) => setTimeout(r, 0)); };
const click = (root: HTMLElement, label: string) => {
  const b = [...root.querySelectorAll('button')].find((x) => x.textContent?.includes(label));
  if (!b) throw new Error(`no button ${label}`);
  b.click();
};
const headline = (root: HTMLElement) => root.querySelector('.headline')?.textContent ?? '';

function setup(
  rec: ReturnType<typeof fakeRecorder> | { error: MicError },
  opts: { sleep?: (ms: number) => Promise<void>; norms?: Norms; yieldToPaint?: () => Promise<void> } = {},
) {
  document.body.innerHTML = '<div id="app"></div>';
  const root = document.getElementById('app')!;
  const openRecorder = vi.fn(async () => rec as unknown as Recorder | { error: MicError });
  new App(root, {
    openRecorder,
    norms: opts.norms ?? (norms as Norms),
    sleep: opts.sleep ?? (async () => {}),
    yieldToPaint: opts.yieldToPaint ?? (async () => {}),
  }).start();
  return { root, openRecorder };
}

const fullSet = () => [goodVowel, goodSentence];

afterEach(() => { vi.restoreAllMocks(); });

describe('App', () => {
  it('exports timing constants', () => {
    expect(VOWEL_SECONDS).toBe(6.5);
    expect(SENTENCE_MAX_SECONDS).toBe(12);
  });

  it('(a) one full set shows a provisional result', async () => {
    const rec = fakeRecorder(fullSet());
    const { root } = setup(rec);
    expect(root.textContent).toContain('声を録音する');
    click(root, '声を録音する');
    await flush();
    expect(headline(root)).toContain('参考');
    expect(root.textContent).toContain('もう1セット');
    expect(rec.release).not.toHaveBeenCalled();
  });

  it('(b) three sets drop the reference note and the extra-set button, releasing once', async () => {
    const rec = fakeRecorder([...fullSet(), ...fullSet(), ...fullSet()]);
    const { root } = setup(rec);
    click(root, '声を録音する');
    await flush();
    click(root, 'もう1セット');
    await flush();
    expect(rec.release).not.toHaveBeenCalled();
    click(root, 'もう1セット');
    await flush();
    expect(headline(root)).not.toContain('参考');
    expect(headline(root)).not.toBe('');
    expect(root.textContent).not.toContain('もう1セット');
    expect(rec.release).toHaveBeenCalledTimes(1);
  });

  it('(c) mic error shows the error screen without throwing, and returns to start', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    const { root, openRecorder } = setup({ error: 'denied' });
    click(root, '声を録音する');
    await flush();
    expect(openRecorder).toHaveBeenCalledTimes(1);
    expect(root.textContent).toContain('マイクが許可されていません');
    click(root, '説明にもどる');
    expect(root.textContent).toContain('声を録音する');
    await flush();
    process.off('unhandledRejection', unhandled);
    expect(unhandled).not.toHaveBeenCalled();
  });

  it('(d) a silent vowel gives the retry screen and the failed set is not stored', async () => {
    const rec = fakeRecorder([() => silentVowel(), goodSentence, ...fullSet()]);
    const { root } = setup(rec);
    click(root, '声を録音する');
    await flush();
    expect(root.textContent).toContain('もう一度録音しましょう');
    expect(root.textContent).toMatch(/声が聞き取れませんでした|声が小さく録音されました/);
    expect(root.querySelector('.headline')).toBeNull();
    expect(rec.release).not.toHaveBeenCalled();
    click(root, 'もう一度録音する');
    await flush();
    expect(headline(root)).toContain('参考'); // one stored set only
  });

  it('(e) interruption abandons the set; a late stop() cannot replace the retry screen', async () => {
    let late!: (r: Rec) => void;
    const pending = new Promise<Rec>((res) => { late = res; });
    const rec = fakeRecorder([() => pending, ...fullSet()]);
    const { root } = setup(rec);
    click(root, '声を録音する');
    await flush();
    expect(rec.stop).toHaveBeenCalledTimes(1);
    rec.onInterrupted!();
    expect(rec.discard).toHaveBeenCalled();
    expect(root.textContent).toContain('録音が中断されました');
    late(goodVowel());
    await flush();
    expect(root.textContent).toContain('録音が中断されました');
    expect(rec.stop).toHaveBeenCalledTimes(1);
    click(root, 'もう一度録音する');
    await flush();
    expect(headline(root)).toContain('参考');
  });

  it('(f) default sex (unspecified) renders a result; female also renders', async () => {
    for (const sex of ['unspecified', 'female'] as const) {
      const rec = fakeRecorder(fullSet());
      const { root } = setup(rec);
      (root.querySelector(`input[value="${sex}"]`) as HTMLInputElement).checked = true;
      click(root, '声を録音する');
      await flush();
      expect(headline(root)).toContain('参考');
    }
  });

  it('the 終了 button ends the sentence early', async () => {
    const rec = fakeRecorder(fullSet());
    const sleep = (ms: number) =>
      ms === SENTENCE_MAX_SECONDS * 1000 ? new Promise<void>(() => {}) : Promise.resolve();
    const { root } = setup(rec, { sleep });
    click(root, '声を録音する');
    await flush();
    expect(rec.stop).toHaveBeenCalledTimes(1);
    expect(headline(root)).toBe('');
    click(root, '終了');
    await flush();
    expect(rec.stop).toHaveBeenCalledTimes(2);
    expect(headline(root)).toContain('参考');
  });

  it('rests between the vowel and the sentence: stop -> sleep(REST) -> sentence start', async () => {
    const rec = fakeRecorder(fullSet());
    const order: string[] = [];
    rec.start.mockImplementation(async () => { order.push('start'); });
    rec.stop.mockImplementationOnce(async () => { order.push('stop'); return goodVowel(); });
    const sleep = async (ms: number) => { order.push(`sleep:${ms}`); };
    const { root } = setup(rec, { sleep });
    click(root, '声を録音する');
    await flush();
    // The vowel is waited out in 1 s chunks (for the countdown): 6 x 1000 ms + 500 ms = VOWEL_SECONDS.
    const vowelSleeps = ['sleep:1000', 'sleep:1000', 'sleep:1000', 'sleep:1000', 'sleep:1000', 'sleep:1000', 'sleep:500'];
    expect(vowelSleeps.reduce((n, x) => n + Number(x.slice(6)), 0)).toBe(VOWEL_SECONDS * 1000);
    expect(order.slice(0, 11)).toEqual([
      'start', ...vowelSleeps, 'stop', `sleep:${REST_SECONDS * 1000}`, 'start',
    ]);
    expect(REST_SECONDS).toBe(1.5);
  });

  it('shows the rest text (no 終了, no どうぞ) during the pause, with no sentence recording yet', async () => {
    const rec = fakeRecorder(fullSet());
    let releaseRest!: () => void;
    const sleep = (ms: number) =>
      ms === REST_SECONDS * 1000 ? new Promise<void>((res) => { releaseRest = res; }) : Promise.resolve();
    const { root } = setup(rec, { sleep });
    click(root, '声を録音する');
    await flush();
    expect(root.textContent).toContain('ひと息ついてください');
    expect(root.textContent).not.toContain('どうぞ');
    expect((root.querySelector('button') as HTMLButtonElement | null)?.hidden ?? true).toBe(true);
    expect(rec.start).toHaveBeenCalledTimes(1);
    releaseRest();
    await flush();
    expect(rec.start).toHaveBeenCalledTimes(2);
  });

  it('an interruption during the rest pause shows the retry screen and starts no sentence recording', async () => {
    const rec = fakeRecorder(fullSet());
    let releaseRest!: () => void;
    const sleep = (ms: number) =>
      ms === REST_SECONDS * 1000 ? new Promise<void>((res) => { releaseRest = res; }) : Promise.resolve();
    const { root } = setup(rec, { sleep });
    click(root, '声を録音する');
    await flush();
    rec.onInterrupted!();
    expect(root.textContent).toContain('録音が中断されました');
    releaseRest();
    await flush();
    expect(rec.start).toHaveBeenCalledTimes(1);
    expect(root.textContent).toContain('録音が中断されました');
  });

  it('a late-onset vowel (voice from 1.3 s to the end) passes the gate', async () => {
    const rec = fakeRecorder([lateOnsetVowel, goodSentence]);
    const { root } = setup(rec);
    click(root, '声を録音する');
    await flush();
    expect(root.textContent).not.toContain('もう一度録音しましょう');
    expect(headline(root)).toContain('参考');
  });

  it('counts down the vowel once per second', async () => {
    const rec = fakeRecorder(fullSet());
    const seen: string[] = [];
    const sleep = async (ms: number) => {
      const t = document.querySelector('.remaining') as HTMLElement | null;
      if (ms <= 1000 && t && !t.hidden) seen.push(t.textContent ?? '');
    };
    const { root } = setup(rec, { sleep });
    click(root, '声を録音する');
    await flush();
    expect(seen).toEqual(['あと 7 秒', 'あと 6 秒', 'あと 5 秒', 'あと 4 秒', 'あと 3 秒', 'あと 2 秒', 'あと 1 秒']);
    expect(headline(root)).toContain('参考');
  });

  it('shows the analysing state (no 終了, no prompt) and yields to paint BEFORE the analysis runs', async () => {
    probe.textAtExtractSentence.length = 0;
    const rec = fakeRecorder(fullSet());
    let paint!: () => void;
    const yieldToPaint = vi.fn(() => new Promise<void>((res) => { paint = res; }));
    const { root } = setup(rec, { yieldToPaint });
    click(root, '声を録音する');
    await flush();
    expect(yieldToPaint).toHaveBeenCalledTimes(1);
    expect(probe.textAtExtractSentence).toEqual([]);
    expect(root.textContent).toContain('結果をまとめています');
    expect(root.textContent).not.toContain('ふだんの話し方');
    expect([...root.querySelectorAll('button')].every((b) => b.hidden)).toBe(true);
    paint();
    await flush();
    expect(probe.textAtExtractSentence).toHaveLength(1);
    expect(probe.textAtExtractSentence[0]).toContain('結果をまとめています');
    expect(headline(root)).toContain('参考');
  });

  it('hides the instruction during the pre-roll and shows it once ready', async () => {
    const rec = fakeRecorder(fullSet());
    let go!: () => void;
    rec.start.mockImplementationOnce(() => new Promise<void>((res) => { go = res; }));
    const { root } = setup(rec);
    click(root, '声を録音する');
    await flush();
    expect(root.textContent).toContain('準備しています。静かにお待ちください');
    expect(root.textContent).not.toContain('「あー」と');
    go();
    await flush();
    expect(headline(root)).toContain('参考');
  });
});
