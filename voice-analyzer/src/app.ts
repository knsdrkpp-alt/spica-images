import type { MicError, Recorder } from './audio/capture';
import { classify, medianProfile } from './diagnosis/classify';
import { buildFeedback } from './diagnosis/feedback';
import { checkGate } from './diagnosis/gate';
import type { GateReason } from './diagnosis/gate';
import { toProfile } from './diagnosis/profile';
import type { Norms } from './diagnosis/profile';
import { extractSentence, extractVowel } from './dsp/features';
import type { SetFeatures, Sex } from './types';
import {
  renderMicError, renderRecording, renderResult, renderRetry, renderStart,
} from './ui/screens';

/**
 * Vowel recording length. The on-screen instruction still says 約5秒: features trim 0.75 s from each
 * end and the gate needs >= 3 s voiced, so the extra time lets a slow starter still pass.
 */
export const VOWEL_SECONDS = 6.5;
/** Countdown granularity during the vowel. */
const TICK_MS = 1000;
export const SENTENCE_MAX_SECONDS = 12;
/** Pause between the vowel and the sentence so a lingering 「あー」 cannot reach the sentence's noise pre-roll. */
export const REST_SECONDS = 1.5;
const MAX_SETS = 3;

export interface AppDeps {
  openRecorder: () => Promise<Recorder | { error: MicError }>;
  norms: Norms;
  sleep?: (ms: number) => Promise<void>;
  /** Lets the browser paint (e.g. the analysing message) before the synchronous analysis runs. */
  yieldToPaint?: () => Promise<void>;
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** One animation frame (so the pending DOM change is painted), then a macrotask. */
const realYieldToPaint = () => new Promise<void>((resolve) => {
  const after = () => setTimeout(resolve, 0);
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(after);
  else after();
});

function meanBandShare(sets: SetFeatures[]): number[] {
  const len = sets[0].sentence.bandShare.length;
  const acc = new Array<number>(len).fill(0);
  for (const s of sets) s.sentence.bandShare.forEach((v, i) => { acc[i] += Number.isFinite(v) ? v : 0; });
  const total = acc.reduce((a, b) => a + b, 0);
  return total > 0 ? acc.map((v) => v / total) : acc.map(() => 0);
}

export class App {
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly yieldToPaint: () => Promise<void>;
  private recorder: Recorder | null = null;
  private sets: SetFeatures[] = [];
  private sex: Sex = 'unspecified';
  /** Bumped whenever a set is started, abandoned, or the app returns to start. */
  private token = 0;

  constructor(private readonly root: HTMLElement, private readonly deps: AppDeps) {
    this.sleep = deps.sleep ?? realSleep;
    this.yieldToPaint = deps.yieldToPaint ?? realYieldToPaint;
  }

  start(): void {
    this.token++;
    this.releaseRecorder();
    this.sets = [];
    this.show(renderStart((sex) => this.begin(sex)));
  }

  private show(el: HTMLElement): void {
    this.root.replaceChildren(el);
  }

  private releaseRecorder(): void {
    const r = this.recorder;
    this.recorder = null;
    if (r) {
      r.onInterrupted = null;
      r.release();
    }
  }

  private begin(sex: Sex): void {
    this.sex = sex;
    this.releaseRecorder();
    const token = ++this.token;
    // openRecorder is called synchronously from the click handler to keep the user gesture.
    let opening: Promise<Recorder | { error: MicError }>;
    try {
      opening = this.deps.openRecorder();
    } catch {
      this.show(renderMicError('unsupported', () => this.start()));
      return;
    }
    void opening.then(
      (res) => {
        if (token !== this.token) {
          if (!('error' in res)) res.release();
          return;
        }
        if ('error' in res) {
          this.show(renderMicError(res.error, () => this.start()));
          return;
        }
        this.recorder = res;
        return this.runSet();
      },
      () => {
        if (token === this.token) this.show(renderMicError('unsupported', () => this.start()));
      },
    ).catch(() => {
      if (token === this.token) this.fail();
    });
  }

  /** Unexpected failure: free the mic and show a generic retry-less error. */
  private fail(): void {
    this.releaseRecorder();
    this.show(renderMicError('unsupported', () => this.start()));
  }

  private async runSet(): Promise<void> {
    const recorder = this.recorder;
    if (!recorder) return;
    const token = ++this.token;
    const alive = () => token === this.token && this.recorder === recorder;
    const retry = () => {
      this.runSet().catch(() => this.fail());
    };

    recorder.onInterrupted = () => {
      if (!alive()) return;
      this.token++; // abandon: late results of this run are ignored
      recorder.discard();
      this.show(renderRetry('interrupted', retry));
    };

    let stopSentence: () => void = () => {};
    const view = renderRecording(() => stopSentence());
    this.show(view.el);

    try {
      view.setPhase('vowel');
      view.setReady(false);
      await recorder.start((_rms, wave) => { if (alive()) view.setWave(wave); });
      if (!alive()) return;
      view.setReady(true);
      for (let leftMs = VOWEL_SECONDS * 1000; leftMs > 0;) {
        view.setRemaining(leftMs / 1000);
        const step = Math.min(TICK_MS, leftMs);
        await this.sleep(step);
        if (!alive()) return;
        leftMs -= step;
      }
      const vowelRec = await recorder.stop();
      if (!alive()) return;

      view.setPhase('rest');
      await this.sleep(REST_SECONDS * 1000);
      if (!alive()) return;
      view.setPhase('sentence');
      view.setReady(false);
      await recorder.start((_rms, wave) => { if (alive()) view.setWave(wave); });
      if (!alive()) return;
      view.setReady(true);
      await Promise.race([
        this.sleep(SENTENCE_MAX_SECONDS * 1000),
        new Promise<void>((resolve) => { stopSentence = resolve; }),
      ]);
      if (!alive()) return;
      const sentenceRec = await recorder.stop();
      if (!alive()) return;

      recorder.onInterrupted = null;
      const sr = recorder.sampleRate;
      const processingOn = recorder.processingOn;
      view.setPhase('analyzing');
      await this.yieldToPaint();
      if (!alive()) return;
      const vowel = extractVowel(vowelRec.samples, sr);
      const sentence = extractSentence(sentenceRec.samples, sr);
      const gates: GateReason[] = [];
      const gv = checkGate({ samples: vowelRec.samples, sampleRate: sr, preRoll: vowelRec.preRoll, task: 'vowel', features: vowel, processingOn });
      if (!gv.ok) gates.push(gv.reason);
      const gs = checkGate({ samples: sentenceRec.samples, sampleRate: sr, preRoll: sentenceRec.preRoll, task: 'sentence', features: sentence, processingOn });
      if (!gs.ok) gates.push(gs.reason);
      if (gates.length) {
        this.show(renderRetry(gates[0], retry));
        return;
      }
      this.sets.push({ vowel, sentence, flags: { processingOn } });
      this.showResult();
    } catch {
      if (alive()) this.fail();
    }
  }

  private showResult(): void {
    const { sets, deps } = this;
    const profiles = sets.map((s) => toProfile(s, this.sex, deps.norms));
    const c = classify(profiles);
    const f = buildFeedback(c, medianProfile(profiles), sets[sets.length - 1], sets.length);
    const canRecordMore = sets.length < MAX_SETS;
    if (!canRecordMore) this.releaseRecorder();
    this.show(renderResult(f, meanBandShare(sets), {
      provisionalNorms: deps.norms.provisional,
      canRecordMore,
      onAgain: () => {
        this.runSet().catch(() => this.fail());
      },
    }));
  }
}
