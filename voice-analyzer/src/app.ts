import type { MicError, Recorder } from './audio/capture';
import { classify, medianProfile } from './diagnosis/classify';
import { buildFeedback } from './diagnosis/feedback';
import { checkGate, type GateDetail } from './diagnosis/gate';
import type { GateReason, GateWarning } from './diagnosis/gate';
import { NOTICE_NOISE, NOTICE_PROCESSING } from './diagnosis/copy';
import { toProfile } from './diagnosis/profile';
import type { Norms } from './diagnosis/profile';
import { extractSentence, extractVowel } from './dsp/features';
import { hzToNoteName } from './dsp/note';
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
export const SENTENCE_MAX_SECONDS = 15;
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

function median(xs: Array<number | null>): number | null {
  const v = xs.filter((x): x is number => x !== null && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = v.length >> 1;
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

export class App {
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly yieldToPaint: () => Promise<void>;
  private recorder: Recorder | null = null;
  private sets: SetFeatures[] = [];
  /** Gate warnings of each accepted set (parallel to `sets`). */
  private warnings: GateWarning[][] = [];
  private sex: Sex = 'unspecified';
  /** Bumped whenever a set is started, abandoned, or the app returns to start. */
  private token = 0;

  constructor(private readonly root: HTMLElement, private readonly deps: AppDeps) {
    this.sleep = deps.sleep ?? realSleep;
    this.yieldToPaint = deps.yieldToPaint ?? realYieldToPaint;
    // Leaving the page (or freezing it into the back/forward cache) must not keep the mic open.
    root.ownerDocument.defaultView?.addEventListener('pagehide', () => this.onPageHide());
  }

  start(): void {
    this.token++;
    this.releaseRecorder();
    this.sets = [];
    this.warnings = [];
    this.show(renderStart((sex) => this.begin(sex)));
  }

  private readonly home = () => this.start();

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

  private onPageHide(): void {
    if (!this.recorder) return; // result/retry/start screens hold no mic
    this.token++; // abandon the running set
    this.releaseRecorder();
    this.show(renderRetry('interrupted', () => this.openAndRun(), this.home));
  }

  private begin(sex: Sex): void {
    this.sex = sex;
    this.openAndRun();
  }

  /**
   * Opens the microphone and runs one set. Must be called synchronously from a click handler
   * (start, もう1セット, もう一度録音する) so getUserMedia / AudioContext keep the user gesture.
   */
  private openAndRun(): void {
    this.releaseRecorder();
    const token = ++this.token;
    let opening: Promise<Recorder | { error: MicError }>;
    try {
      opening = this.deps.openRecorder();
    } catch {
      this.show(renderMicError('unsupported', this.home));
      return;
    }
    void opening.then(
      (res) => {
        if (token !== this.token) {
          if (!('error' in res)) res.release();
          return;
        }
        if ('error' in res) {
          this.show(renderMicError(res.error, this.home));
          return;
        }
        this.recorder = res;
        return this.runSet();
      },
      () => {
        if (token === this.token) this.show(renderMicError('unsupported', this.home));
      },
    ).catch(() => {
      if (token === this.token) this.fail();
    });
  }

  /** Unexpected failure: free the mic and show a generic retry-less error. */
  private fail(): void {
    this.releaseRecorder();
    this.show(renderMicError('unsupported', this.home));
  }

  private async runSet(): Promise<void> {
    const recorder = this.recorder;
    if (!recorder) return;
    const token = ++this.token;
    const alive = () => token === this.token && this.recorder === recorder;
    const retry = () => this.openAndRun();

    recorder.onInterrupted = () => {
      if (!alive()) return;
      this.token++; // abandon: late results of this run are ignored
      recorder.discard();
      this.releaseRecorder();
      this.show(renderRetry('interrupted', retry, this.home));
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

      const sr = recorder.sampleRate;
      const processingOn = recorder.processingOn;
      // Both takes are in memory: close the mic before analysing; the next set reopens it.
      this.releaseRecorder();
      const live = () => token === this.token;
      view.setPhase('analyzing');
      await this.yieldToPaint();
      if (!live()) return;
      const vowel = extractVowel(vowelRec.samples, sr);
      const sentence = extractSentence(sentenceRec.samples, sr);
      const gates: { reason: GateReason; detail: GateDetail }[] = [];
      const warnings: GateWarning[] = [];
      for (const g of [
        checkGate({ samples: vowelRec.samples, sampleRate: sr, preRoll: vowelRec.preRoll, task: 'vowel', features: vowel, processingOn }),
        checkGate({ samples: sentenceRec.samples, sampleRate: sr, preRoll: sentenceRec.preRoll, task: 'sentence', features: sentence, processingOn }),
      ]) {
        if (g.ok) warnings.push(...g.warnings);
        else gates.push({ reason: g.reason, detail: g.detail });
      }
      if (gates.length) {
        this.show(renderRetry(gates[0].reason, retry, this.home, gates[0].detail));
        return;
      }
      this.sets.push({ vowel, sentence, flags: { processingOn } });
      this.warnings.push(warnings);
      this.showResult();
    } catch {
      if (token === this.token) this.fail();
    }
  }

  private showResult(): void {
    const { sets, deps } = this;
    const profiles = sets.map((s) => toProfile(s, this.sex, deps.norms));
    const c = classify(profiles);
    const bandShare = meanBandShare(sets);
    // Describe the dominant band from the same averaged shares the charts show (stored set untouched).
    const last = sets[sets.length - 1];
    const lastWithMean: SetFeatures = { ...last, sentence: { ...last.sentence, bandShare } };
    const f = buildFeedback(c, medianProfile(profiles), lastWithMean, sets.length);
    const notices: string[] = [];
    if (sets.some((s) => s.flags.processingOn)) notices.push(NOTICE_PROCESSING);
    if (this.warnings.some((w) => w.includes('noise-borderline'))) notices.push(NOTICE_NOISE);
    const f0Hz = median(sets.map((s) => s.sentence.f0MedianHz));
    const stabilitySt = median(sets.map((s) => s.vowel.f0StabilitySt));
    this.show(renderResult(f, bandShare, {
      provisionalNorms: deps.norms.provisional,
      canRecordMore: sets.length < MAX_SETS,
      onAgain: () => this.openAndRun(),
      onHome: this.home,
      notices,
      measures: {
        f0Hz,
        f0Note: f0Hz === null ? null : hzToNoteName(f0Hz),
        stabilityCent: stabilitySt === null ? null : Math.round(stabilitySt * 100),
      },
    }));
  }
}
