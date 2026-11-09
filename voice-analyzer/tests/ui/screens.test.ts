import { readFileSync } from 'node:fs';
import { describe, it, expect, vi } from 'vitest';
import {
  renderStart, renderRecording, renderResult, renderMicError, renderRetry,
} from '../../src/ui/screens';
import { BAND_NOTES } from '../../src/ui/band-notes';
import { findBannedWords, type Feedback } from '../../src/diagnosis/feedback';
import {
  FIXED_FOOTER, MULTI_SET_NOTE, NOTICE_NOISE, NOTICE_PROCESSING, PRACTICE_CADENCE, STOP_NOTICE,
} from '../../src/diagnosis/copy';
import { READING_TEXT } from '../../src/diagnosis/config';
import type { MicError } from '../../src/audio/capture';
import type { GateReason } from '../../src/diagnosis/gate';

const fb: Feedback = {
  headline: '今回の録音では透明感タイプの傾向です',
  tendency: '高めの帯域が相対的に多い傾向があります。',
  strengths: ['声の輪郭が安定している傾向があります。'],
  focus: ['澄み具合'],
  practice: [{ title: 'ウォームアップ', minutes: 2, how: 'ハミングで楽な声を出します。' }],
  sets: 1,
};
const share = new Array(12).fill(1 / 12);
const noop = () => {};
const NO_MEASURES = { f0Hz: null, f0Note: null, stabilityCent: null };
const MEASURES = { f0Hz: 219.6, f0Note: 'A3', stabilityCent: 23 };
const MIC: MicError[] = ['denied', 'no-device', 'insecure-context', 'unsupported'];
const REASONS: (GateReason | 'interrupted')[] = [
  'too-noisy', 'clipping', 'too-quiet', 'no-voice', 'vowel-too-short', 'vowel-unstable', 'sentence-too-short', 'interrupted',
];
const count = (s: string, sub: string) => s.split(sub).length - 1;
type ResultOpts = Parameters<typeof renderResult>[2];
const result = (o: Partial<ResultOpts> = {}) =>
  renderResult(fb, share, { provisionalNorms: false, canRecordMore: true, onAgain: noop, onHome: noop, notices: [], measures: NO_MEASURES, ...o });
const buttonByText = (el: HTMLElement, t: string) =>
  Array.from(el.querySelectorAll('button')).find((b) => b.textContent!.includes(t));

describe('renderResult', () => {
  it('has footer and stop notice exactly once; footer is last child', () => {
    const el = result();
    expect(count(el.textContent!, FIXED_FOOTER)).toBe(1);
    expect(count(el.textContent!, STOP_NOTICE)).toBe(1);
    const last = el.lastElementChild!;
    expect(last.tagName).toBe('FOOTER');
    expect(last.textContent).toContain(FIXED_FOOTER);
    expect(el.querySelector('h2')!.textContent).toBe(fb.headline);
    expect(el.querySelectorAll('svg')).toHaveLength(2);
    expect(el.textContent).toContain('グラフの読み方');
  });
  it('keeps STOP_NOTICE and footer exactly once even without practice steps', () => {
    const el = renderResult({ ...fb, practice: [] }, share, { provisionalNorms: false, canRecordMore: true, onAgain: noop, onHome: noop, notices: [], measures: NO_MEASURES });
    expect(count(el.textContent!, STOP_NOTICE)).toBe(1);
    expect(count(el.textContent!, FIXED_FOOTER)).toBe(1);
    expect(el.lastElementChild!.tagName).toBe('FOOTER');
  });
  it('shows 仮の基準 only when provisional', () => {
    expect(count(result({ provisionalNorms: true }).textContent!, '仮の基準')).toBe(1);
    expect(result({ provisionalNorms: false }).textContent).not.toContain('仮の基準');
  });
  it('record-more button follows canRecordMore and disables itself while the mic opens', () => {
    expect(buttonByText(result({ canRecordMore: false }), 'もう1セット')).toBeUndefined();
    const onAgain = vi.fn();
    const b = buttonByText(result({ onAgain }), 'もう1セット録音する')!;
    b.click();
    b.click();
    expect(onAgain).toHaveBeenCalledTimes(1);
    expect(b.disabled).toBe(true);
  });
  it('always has a 最初にもどる button', () => {
    for (const more of [true, false]) {
      const onHome = vi.fn();
      buttonByText(result({ canRecordMore: more, onHome }), '最初にもどる')!.click();
      expect(onHome).toHaveBeenCalledTimes(1);
    }
  });
  it('shows the より安定した結果 line only from the 2nd set on', () => {
    expect(result().textContent).not.toContain(MULTI_SET_NOTE);
    for (const sets of [2, 3]) {
      expect(count(renderResult({ ...fb, sets }, share, {
        provisionalNorms: false, canRecordMore: true, onAgain: noop, onHome: noop, notices: [], measures: NO_MEASURES,
      }).textContent!, MULTI_SET_NOTE)).toBe(1);
    }
    expect(MULTI_SET_NOTE).toContain('より安定した結果');
  });
  it('renders each notice once in the neutral .notice style', () => {
    const el = result({ notices: [NOTICE_PROCESSING, NOTICE_NOISE] });
    for (const n of [NOTICE_PROCESSING, NOTICE_NOISE]) {
      const hits = Array.from(el.querySelectorAll('.notice')).filter((e) => e.textContent === n);
      expect(hits).toHaveLength(1);
    }
    expect(result().textContent).not.toContain(NOTICE_PROCESSING);
    expect(result().textContent).not.toContain(NOTICE_NOISE);
  });
  it('shows the measured values, hedged, and leaves out null ones', () => {
    const el = result({ measures: MEASURES });
    const sec = el.querySelector('.measures')!;
    expect(sec.querySelector('h3')!.textContent).toBe('測った値');
    expect(sec.textContent).toContain('声の高さ:約 220 Hz(音名 A3)');
    expect(sec.textContent).toContain('声の安定:約 ±23 セント');
    expect(sec.textContent).toContain('目安');
    expect(sec.textContent).not.toMatch(/速さ|スピード|モーラ/);
    const onlyPitch = result({ measures: { f0Hz: 100, f0Note: 'G2', stabilityCent: null } }).querySelector('.measures')!;
    expect(onlyPitch.textContent).toContain('約 100 Hz(音名 G2)');
    expect(onlyPitch.querySelector('ul')!.textContent).not.toContain('声の安定');
    const onlyStab = result({ measures: { f0Hz: null, f0Note: null, stabilityCent: 8 } }).querySelector('.measures')!;
    expect(onlyStab.querySelector('ul')!.textContent).not.toContain('声の高さ');
    expect(onlyStab.textContent).toContain('約 ±8 セント');
    expect(result().querySelector('.measures')).toBeNull();
  });
  it('practice section ends with the practice cadence line', () => {
    const el = result();
    expect(count(el.textContent!, PRACTICE_CADENCE)).toBe(1);
    expect(PRACTICE_CADENCE).toBe('週3〜5日、2〜4週ほど続けてから、もう一度チェックしてみてください。');
  });
  it('legend buttons toggle band notes', () => {
    const el = result();
    const legend = el.querySelectorAll<HTMLButtonElement>('.legend button');
    expect(legend).toHaveLength(12);
    expect(el.textContent).toContain('音響的な裏づけは弱い、一般的な目安です');
    expect(el.textContent).not.toContain(BAND_NOTES[3]);
    legend[3].click();
    expect(el.textContent).toContain(`4(299〜431 Hz):${BAND_NOTES[3]}`);
    expect(legend[3].textContent).toContain('4');
    expect(legend[3].textContent).toContain('299〜431 Hz');
    expect(legend[3].getAttribute('aria-expanded')).toBe('true');
    legend[3].click();
    expect(el.textContent).not.toContain(BAND_NOTES[3]);
  });
  it('BAND_NOTES avoid impression, personality, ability and anatomy wording', () => {
    for (const stem of ['印象', '性格', '能力', '存在感', 'あたたか', 'きらびやか', '空気感', '胸']) {
      for (const n of BAND_NOTES) expect(n).not.toContain(stem);
    }
  });
  it('BAND_NOTES has 12 short notes', () => {
    expect(BAND_NOTES).toHaveLength(12);
    for (const n of BAND_NOTES) expect(n.length).toBeLessThan(60);
  });
});

describe('renderMicError', () => {
  it('has distinct text and a working back button', () => {
    const texts = MIC.map((e) => renderMicError(e, noop).textContent);
    expect(new Set(texts).size).toBe(4);
    const onBack = vi.fn();
    buttonByText(renderMicError('denied', onBack), '説明にもどる')!.click();
    expect(onBack).toHaveBeenCalled();
    expect(renderMicError('denied', noop).textContent).toContain('ブラウザの設定でマイクを許可');
  });
  it('uses the neutral notice-screen class, and its CSS heading is not the accent colour', () => {
    for (const e of MIC) expect(renderMicError(e, noop).classList.contains('notice-screen')).toBe(true);
    for (const r of REASONS) expect(renderRetry(r, noop, noop).classList.contains('notice-screen')).toBe(true);
    const css = readFileSync('src/ui/styles.css', 'utf8');
    const rule = css.match(/\.notice-screen h1\s*\{([^}]*)\}/);
    expect(rule).not.toBeNull();
    const color = rule![1].match(/color:\s*([^;]+);/)![1].trim();
    expect(color).not.toBe('var(--accent)');
    expect(color).not.toMatch(/#c8213c/i);
  });
  it('uses neutral styling', () => {
    for (const e of MIC) {
      for (const el of Array.from(renderMicError(e, noop).querySelectorAll('*'))) {
        const s = `${el.getAttribute('class') ?? ''} ${el.getAttribute('style') ?? ''}`;
        expect(s).not.toMatch(/error|danger|warn|alert/i);
      }
    }
  });
});

describe('renderRetry', () => {
  it('too-noisy asks to start speaking only after どうぞ', () => {
    expect(renderRetry('too-noisy', noop, noop).textContent).toContain('「どうぞ」が出てから話し始めてください。');
  });
  it('has a distinct message per reason and a retry button', () => {
    const texts = REASONS.map((r) => renderRetry(r, noop, noop).textContent);
    expect(new Set(texts).size).toBe(8);
    const onRetry = vi.fn();
    const b = buttonByText(renderRetry('too-quiet', onRetry, noop), 'もう一度録音する')!;
    b.click();
    b.click();
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(b.disabled).toBe(true);
  });
  it('shows rounded measured values for too-noisy and too-quiet only', () => {
    const detail = { snrDb: 17.4, noiseFloorDbfs: -48.2, speechDbfs: -31, peakDbfs: -38.4 };
    const noisy = renderRetry('too-noisy', noop, noop, detail).querySelector('.retry-detail')!.textContent!;
    expect(noisy).toContain('録音前の静けさとの差は約 17 dB でした(20 dB 以上が目安)');
    expect(noisy).toContain('録音前の音の大きさは約 -48 dBFS でした');
    const quiet = renderRetry('too-quiet', noop, noop, detail).querySelector('.retry-detail')!.textContent!;
    expect(quiet).toContain('約 -38 dBFS でした(-30 dBFS 以上が目安)');
    for (const r of REASONS.filter((x) => x !== 'too-noisy' && x !== 'too-quiet')) {
      expect(renderRetry(r, noop, noop, detail).querySelector('.retry-detail')).toBeNull();
    }
    expect(renderRetry('too-noisy', noop, noop).querySelector('.retry-detail')).toBeNull();
  });
  it('omits null values and never prints NaN', () => {
    const t = renderRetry('too-noisy', noop, noop, { snrDb: null, noiseFloorDbfs: null, speechDbfs: -30, peakDbfs: -10 });
    expect(t.querySelector('.retry-detail')).toBeNull();
    const nan = renderRetry('too-noisy', noop, noop, { snrDb: Number.NaN, noiseFloorDbfs: -50, speechDbfs: -30, peakDbfs: -10 });
    expect(nan.textContent).not.toContain('NaN');
    expect(nan.querySelector('.retry-detail')!.textContent).toContain('-50 dBFS');
  });
  it('always has a 最初にもどる button', () => {
    for (const r of REASONS) {
      const onHome = vi.fn();
      buttonByText(renderRetry(r, noop, onHome), '最初にもどる')!.click();
      expect(onHome).toHaveBeenCalledTimes(1);
    }
  });
});

describe('renderStart', () => {
  it('defaults to unspecified and passes the selected sex', () => {
    // The button disables itself after one click, so each choice gets a fresh screen.
    const onStart = vi.fn();
    buttonByText(renderStart(onStart), '声を録音する')!.click();
    expect(onStart).toHaveBeenLastCalledWith('unspecified');
    for (const sex of ['female', 'male'] as const) {
      const el = renderStart(onStart);
      el.querySelector<HTMLInputElement>(`input[type=radio][value=${sex}]`)!.click();
      buttonByText(el, '声を録音する')!.click();
      expect(onStart).toHaveBeenLastCalledWith(sex);
    }
  });
  it('disables 声を録音する after the first click (no parallel mic opens)', () => {
    const onStart = vi.fn();
    const b = buttonByText(renderStart(onStart), '声を録音する')!;
    b.click();
    b.click();
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(b.disabled).toBe(true);
  });
  it('has required copy', () => {
    const el = renderStart(noop);
    expect(el.querySelector('h1')!.textContent).toBe('声のタイプチェック');
    for (const t of ['このチェックでわかること', '音声は端末の外に送りません', '吃音', '15〜30 cm', '16歳未満']) {
      expect(el.textContent).toContain(t);
    }
  });
});

describe('renderRecording', () => {
  it('switches phases and the stop button', () => {
    const onStop = vi.fn();
    const r = renderRecording(onStop);
    r.setPhase('vowel');
    r.setReady(true);
    expect(r.el.textContent).toContain('「あー」と、楽な声で約5秒のばしてください');
    expect(r.el.textContent).not.toContain(READING_TEXT);
    const stop = () => buttonByText(r.el, '終了')!;
    expect(stop().hidden).toBe(true);
    r.setPhase('sentence');
    expect(r.el.textContent).toContain(READING_TEXT);
    expect(r.el.textContent).toContain('ふだんの話し方で読み上げてください');
    expect(stop().hidden).toBe(false);
    stop().click();
    expect(onStop).toHaveBeenCalled();
    r.setPhase('vowel');
    expect(stop().hidden).toBe(true);
  });
  it('rest phase shows only the rest text', () => {
    const r = renderRecording(noop);
    r.setPhase('sentence');
    r.setReady(true);
    r.setPhase('rest');
    const t = r.el.textContent ?? '';
    expect(t).toContain('ひと息ついてください');
    expect(t).not.toContain('どうぞ');
    expect(t).not.toContain('準備しています');
    expect(t).not.toContain('「あー」と');
    expect(t).not.toContain(READING_TEXT);
    expect(t).not.toContain('ふだんの話し方');
    expect(buttonByText(r.el, '終了')!.hidden).toBe(true);
    r.setPhase('sentence');
    r.setReady(false);
    expect(r.el.textContent).toContain('準備しています');
    expect(r.el.textContent).not.toContain('ひと息');
  });
  it('ready states', () => {
    const r = renderRecording(noop);
    r.setReady(false);
    expect(r.el.textContent).toContain('準備しています。静かにお待ちください');
    r.setReady(true);
    expect(r.el.textContent).toContain('どうぞ');
    expect(r.el.textContent).not.toContain('準備しています');
  });
  const nextFrame = () => new Promise<void>((res) => requestAnimationFrame(() => res()));
  it('setWave yields finite output', async () => {
    const r = renderRecording(noop);
    document.body.replaceChildren(r.el);
    r.setWave(Float32Array.from([0, 0.5, -0.5, NaN, Infinity, 1]));
    await nextFrame();
    const pts = r.el.querySelector('polyline')!.getAttribute('points')!;
    expect(pts.split(' ')).toHaveLength(6);
    r.setWave(new Float32Array(0));
    await nextFrame();
    const html = r.el.innerHTML;
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('Infinity');
  });
  it('setWave repaints at most once per frame, with the latest block', async () => {
    const r = renderRecording(noop);
    document.body.replaceChildren(r.el);
    const line = r.el.querySelector('polyline')!;
    const spy = vi.spyOn(line, 'setAttribute');
    for (let i = 0; i < 20; i++) r.setWave(Float32Array.from([i / 20, 0, 0]));
    expect(spy).not.toHaveBeenCalled();
    await nextFrame();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(line.getAttribute('points')).toContain(`,${(40 - (19 / 20) * 38).toFixed(1)}`);
    // replaced screen: a late frame does nothing
    r.setWave(Float32Array.from([0.5, 0.5]));
    document.body.replaceChildren();
    await nextFrame();
    expect(spy).toHaveBeenCalledTimes(1);
  });
  it('hides the instruction while not ready and shows it once ready (vowel and sentence)', () => {
    const r = renderRecording(noop);
    const stop = () => buttonByText(r.el, '終了')!;
    r.setPhase('vowel');
    r.setReady(false);
    expect(r.el.textContent).toContain('準備しています。静かにお待ちください');
    expect(r.el.textContent).not.toContain('「あー」と');
    expect(r.el.querySelector<HTMLElement>('.prompt')!.hidden).toBe(true);
    r.setReady(true);
    expect(r.el.textContent).toContain('「あー」と、楽な声で約5秒のばしてください');
    expect(r.el.querySelector<HTMLElement>('.prompt')!.hidden).toBe(false);
    r.setPhase('sentence');
    r.setReady(false);
    expect(r.el.textContent).not.toContain(READING_TEXT);
    expect(r.el.textContent).not.toContain('ふだんの話し方');
    expect(stop().hidden).toBe(true);
    r.setReady(true);
    expect(r.el.textContent).toContain(READING_TEXT);
    expect(stop().hidden).toBe(false);
  });
  it('shows the vowel countdown only in the ready vowel phase', () => {
    const r = renderRecording(noop);
    r.setRemaining(6.5);
    expect(r.el.textContent).not.toContain('あと');
    r.setReady(true);
    expect(r.el.textContent).toContain('あと 7 秒');
    r.setRemaining(0.5);
    expect(r.el.textContent).toContain('あと 1 秒');
    r.setPhase('rest');
    expect(r.el.textContent).not.toContain('あと');
    r.setPhase('vowel');
    expect(r.el.textContent).not.toContain('あと');
  });
  it('analysing phase shows only the analysing message', () => {
    const r = renderRecording(noop);
    r.setPhase('sentence');
    r.setReady(true);
    r.setPhase('analyzing');
    const t = r.el.textContent ?? '';
    expect(t).toContain('結果をまとめています…');
    expect(t).not.toContain(READING_TEXT);
    expect(t).not.toContain('どうぞ');
    expect(t).not.toContain('準備しています');
    expect(buttonByText(r.el, '終了')!.hidden).toBe(true);
  });
});

describe('banned-word lint over all screens', () => {
  it('finds none', () => {
    const els: HTMLElement[] = [renderStart(noop)];
    for (const ph of ['vowel', 'sentence', 'rest', 'analyzing'] as const) {
      for (const ready of [false, true]) {
        const r = renderRecording(noop);
        r.setPhase(ph);
        r.setReady(ready);
        r.setRemaining(3);
        els.push(r.el);
      }
    }
    for (const prov of [true, false]) for (const more of [true, false]) els.push(result({ provisionalNorms: prov, canRecordMore: more }));
    els.push(renderResult({ ...fb, sets: 3, strengths: [], focus: [], practice: [] }, new Array(12).fill(0), {
      provisionalNorms: false, canRecordMore: false, onAgain: noop, onHome: noop, notices: [], measures: NO_MEASURES,
    }));
    for (const sets of [1, 2, 3]) {
      els.push(renderResult({ ...fb, sets }, share, {
        provisionalNorms: true, canRecordMore: sets < 3, onAgain: noop, onHome: noop,
        notices: [NOTICE_PROCESSING, NOTICE_NOISE], measures: MEASURES,
      }));
    }
    for (const e of MIC) els.push(renderMicError(e, noop));
    const lintDetail = { snrDb: 17, noiseFloorDbfs: -48, speechDbfs: -31, peakDbfs: -38 };
    for (const r of REASONS) els.push(renderRetry(r, noop, noop), renderRetry(r, noop, noop, lintDetail));
    for (const el of els) {
      expect(findBannedWords(el.textContent ?? '')).toEqual([]);
      for (const n of [el, ...Array.from(el.querySelectorAll('*'))]) {
        for (const a of ['aria-label', 'title', 'alt']) expect(findBannedWords(n.getAttribute(a) ?? '')).toEqual([]);
      }
    }
    // legend notes too
    expect(findBannedWords(BAND_NOTES.join(''))).toEqual([]);
  });
});
