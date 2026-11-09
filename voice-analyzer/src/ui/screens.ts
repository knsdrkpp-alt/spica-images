import { BAND_COLORS, BAND_EDGES_HZ, GATE, READING_TEXT } from '../diagnosis/config';
import { FIXED_FOOTER, MULTI_SET_NOTE, PRACTICE_CADENCE, STOP_NOTICE } from '../diagnosis/copy';
import type { Feedback } from '../diagnosis/feedback';
import type { GateDetail, GateReason } from '../diagnosis/gate';
import type { MicError } from '../audio/capture';
import type { Sex } from '../types';
import { BAND_NOTES } from './band-notes';
import { renderBarChart, renderPieChart, svgEl } from './charts';

type Child = string | Node;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K, attrs: Record<string, string> = {}, ...children: Child[]
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  for (const c of children) e.append(c);
  return e;
}

function button(label: string, onClick: () => void, cls = 'btn'): HTMLButtonElement {
  const b = h('button', { type: 'button', class: cls }, label);
  b.addEventListener('click', onClick);
  return b;
}

/**
 * A button that opens the microphone: it disables itself on the first click so a second tap
 * cannot start a parallel open. The app always replaces the screen afterwards.
 */
function micButton(label: string, onClick: () => void): HTMLButtonElement {
  const b = h('button', { type: 'button', class: 'btn primary' }, label);
  b.addEventListener('click', () => {
    if (b.disabled) return;
    b.disabled = true;
    onClick();
  });
  return b;
}

const HOME_LABEL = '最初にもどる';

function list(items: string[]): HTMLUListElement {
  return h('ul', {}, ...items.map((t) => h('li', {}, t)));
}

export function renderStart(onStart: (sex: Sex) => void): HTMLElement {
  const sexOptions: [Sex, string][] = [['unspecified', '答えない'], ['female', '女性'], ['male', '男性']];
  const radios = sexOptions.map(([value, label]) => {
    const input = h('input', { type: 'radio', name: 'sex', value });
    if (value === 'unspecified') input.checked = true;
    return { input, node: h('label', { class: 'radio' }, input, label) };
  });
  const selected = (): Sex =>
    (radios.find((r) => r.input.checked)?.input.value as Sex | undefined) ?? 'unspecified';

  return h('section', { class: 'screen start' },
    h('h1', {}, '声のタイプチェック'),
    h('section', {},
      h('h2', {}, 'このチェックでわかること'),
      h('p', {}, '短い録音から声の特徴を見える化し、これからの練習のヒントをお伝えするセルフチェックです。医療や専門的な評価ではありません。'),
    ),
    h('section', {},
      h('h2', {}, '録音のコツ'),
      list([
        '静かな場所で録音してください。',
        '口からマイクまでは約15〜30 cm離してください。',
        '最初に「あー」を約5秒、次に短い文を読み上げます。',
      ]),
    ),
    h('section', { class: 'notice' },
      h('h2', {}, '対象外・精度が下がる場合'),
      h('p', {}, '吃音、構音障害、変声期、方言の強い話し方、日本語が母語でない方、小児の場合は、結果が当てはまりにくいことがあります。'),
      h('p', {}, '16歳未満の方は、保護者と一緒に使ってください。'),
    ),
    h('section', {},
      h('h2', {}, 'プライバシー'),
      h('p', {}, '音声は端末の外に送りません。録音はこのブラウザの中だけで分析します。'),
    ),
    h('fieldset', { class: 'sex' },
      h('legend', {}, '性別(任意)'),
      ...radios.map((r) => r.node),
      h('p', { class: 'note' }, '選んだ内容は、声の高さなどを比べる参考グループを決めるためだけに使います。'),
    ),
    micButton('声を録音する', () => onStart(selected())),
  );
}

export type RecordingPhase = 'vowel' | 'sentence' | 'rest' | 'analyzing';

export interface RecordingView {
  el: HTMLElement;
  setPhase(p: RecordingPhase): void;
  /** While not ready (the noise pre-roll), only the "please wait" status is shown. */
  setReady(ready: boolean): void;
  /** Seconds left in the vowel; null hides the countdown. */
  setRemaining(seconds: number | null): void;
  setWave(w: Float32Array): void;
}

const WAVE = { w: 300, h: 80 };
const FLAT_POINTS = `0,${WAVE.h / 2} ${WAVE.w},${WAVE.h / 2}`;

export const ANALYZING_TEXT = '結果をまとめています…';

function wavePoints(w: Float32Array): string {
  const n = Math.min(w.length, WAVE.w);
  if (n === 0) return FLAT_POINTS;
  const pts: string[] = [];
  for (let i = 0; i < n; i++) {
    const raw = w[Math.floor((i * w.length) / n)];
    const v = Number.isFinite(raw) ? Math.max(-1, Math.min(1, raw)) : 0;
    pts.push(`${((i / Math.max(1, n - 1)) * WAVE.w).toFixed(1)},${(WAVE.h / 2 - v * (WAVE.h / 2 - 2)).toFixed(1)}`);
  }
  return pts.join(' ');
}

export function renderRecording(onStop: () => void): RecordingView {
  const status = h('p', { class: 'status', role: 'status' });
  const prompt = h('p', { class: 'prompt' });
  const sub = h('p', { class: 'note' });
  const remaining = h('p', { class: 'remaining', 'aria-live': 'polite' });
  const svg = svgEl('svg', {
    viewBox: `0 0 ${WAVE.w} ${WAVE.h}`, class: 'wave', role: 'img', 'aria-label': '録音中の声の波形',
  });
  const line = svgEl('polyline', { fill: 'none', points: FLAT_POINTS });
  svg.appendChild(line);
  const stop = button('終了', onStop, 'btn primary');

  const view = h('section', { class: 'screen recording' },
    h('h1', {}, '録音中'), status, prompt, sub, remaining, svg, stop);

  let phase: RecordingPhase = 'vowel';
  let ready = false;
  let left: number | null = null;

  function render(): void {
    const recordingPhase = phase === 'vowel' || phase === 'sentence';
    status.hidden = !recordingPhase;
    status.textContent = !recordingPhase ? '' : ready ? 'どうぞ' : '準備しています。静かにお待ちください';
    // During the pre-roll the instruction stays hidden so nobody starts speaking into the noise measurement.
    const showPrompt = !recordingPhase || ready;
    let p = '';
    let s = '';
    if (phase === 'rest') p = 'ひと息ついてください';
    else if (phase === 'analyzing') p = ANALYZING_TEXT;
    else if (phase === 'vowel') p = '「あー」と、楽な声で約5秒のばしてください';
    else { p = READING_TEXT; s = 'ふだんの話し方で読み上げてください'; }
    prompt.textContent = showPrompt ? p : '';
    sub.textContent = showPrompt ? s : '';
    prompt.hidden = !showPrompt;
    sub.hidden = !showPrompt || s === '';
    const showLeft = phase === 'vowel' && ready && left !== null;
    remaining.hidden = !showLeft;
    remaining.textContent = showLeft ? `あと ${left} 秒` : '';
    stop.hidden = !(phase === 'sentence' && ready);
    svg.style.visibility = phase === 'analyzing' ? 'hidden' : '';
  }

  // Wave updates arrive every 128-sample block; repaint at most once per animation frame.
  let pendingWave: Float32Array | null = null;
  let frame: number | null = null;
  const raf: (cb: () => void) => number = typeof requestAnimationFrame === 'function'
    ? (cb) => requestAnimationFrame(cb)
    : (cb) => setTimeout(cb, 16) as unknown as number;
  function flushWave(): void {
    frame = null;
    const w = pendingWave;
    pendingWave = null;
    if (w && view.isConnected) line.setAttribute('points', wavePoints(w));
  }
  function setWave(w: Float32Array): void {
    pendingWave = w;
    if (frame === null) frame = raf(flushWave);
  }

  function setPhase(p: RecordingPhase): void {
    phase = p;
    if (p !== 'vowel') left = null;
    render();
  }
  function setReady(r: boolean): void {
    ready = r;
    render();
  }
  function setRemaining(seconds: number | null): void {
    left = seconds === null ? null : Math.max(0, Math.ceil(seconds));
    render();
  }
  render();
  return { el: view, setPhase, setReady, setRemaining, setWave };
}

const hzRange = (i: number) => `${BAND_EDGES_HZ[i]}〜${BAND_EDGES_HZ[i + 1]} Hz`;

/** Measured values shown on the result screen; a null value is left out. */
export interface Measures {
  f0Hz: number | null;
  f0Note: string | null;
  stabilityCent: number | null;
}

export interface ResultOptions {
  provisionalNorms: boolean;
  canRecordMore: boolean;
  onAgain: () => void;
  onHome: () => void;
  /** Neutral notices (processing on, borderline noise), one element each. */
  notices: string[];
  measures: Measures;
}

function renderMeasures(m: Measures): HTMLElement | null {
  const items: string[] = [];
  if (m.f0Hz !== null && Number.isFinite(m.f0Hz)) {
    const note = m.f0Note ? `(音名 ${m.f0Note})` : '';
    items.push(`声の高さ:約 ${Math.round(m.f0Hz)} Hz${note}`);
  }
  if (m.stabilityCent !== null && Number.isFinite(m.stabilityCent)) {
    items.push(`声の安定:約 ±${Math.round(m.stabilityCent)} セント`);
  }
  if (!items.length) return null;
  return h('section', { class: 'measures' },
    h('h3', {}, '測った値'),
    list(items),
    h('p', { class: 'note' }, '声の高さは読み上げ、声の安定は「あー」の高さの揺れ(セントは半音の100分の1)から求めた目安です。録音した環境や機種によって変わります。'),
  );
}

export function renderResult(f: Feedback, bandShare: number[], opts: ResultOptions): HTMLElement {
  const note = h('p', { class: 'band-note', role: 'status' });
  let open = -1;
  const legendButtons = BAND_COLORS.map((color, i) => {
    const swatch = h('span', { class: 'swatch', 'aria-hidden': 'true' });
    swatch.style.background = color;
    const b = h('button', { type: 'button', class: 'legend-item', 'aria-expanded': 'false' },
      swatch, `${i + 1}  ${hzRange(i)}`);
    b.addEventListener('click', () => {
      open = open === i ? -1 : i;
      legendButtons.forEach((x, j) => x.setAttribute('aria-expanded', String(j === open)));
      note.textContent = open === -1 ? '' : `${i + 1}(${hzRange(i)}):${BAND_NOTES[i]}`;
    });
    return b;
  });

  const root = h('article', { class: 'screen result' },
    h('h2', { class: 'headline' }, f.headline),
    h('p', {}, f.tendency),
  );
  if (f.sets >= 2) root.append(h('p', { class: 'note' }, MULTI_SET_NOTE));
  if (opts.provisionalNorms) {
    root.append(h('p', { class: 'notice' }, 'いまは仮の基準を使っているため、今後の調整で表示が変わることがあります。'));
  }
  for (const n of opts.notices) root.append(h('p', { class: 'notice' }, n));
  root.append(
    h('section', { class: 'charts' },
      renderBarChart(bandShare),
      renderPieChart(bandShare),
    ),
    h('section', { class: 'notice' },
      h('h3', {}, 'グラフの読み方'),
      h('p', {}, '棒グラフは帯域ごとの相対的な強さ、円グラフはその割合です。どちらも相対値で、録音した機種などによって変わる目安です。棒グラフの軸は相対的な0〜60の目盛りで、いちばん高い棒を60にそろえています(割合ではありません)。'),
    ),
    h('section', {},
      h('h3', {}, '帯域の凡例'),
      h('p', { class: 'note' }, '色をタップすると、その帯域の一般的な傾向を表示します。音響的な裏づけは弱い、一般的な目安です。'),
      h('div', { class: 'legend' }, ...legendButtons),
      note,
    ),
  );
  const measures = renderMeasures(opts.measures);
  if (measures) root.append(measures);
  if (f.strengths.length) root.append(h('section', {}, h('h3', {}, 'よく出ている点'), list(f.strengths)));
  if (f.focus.length) root.append(h('section', {}, h('h3', {}, '意識してみるとよい点'), list(f.focus)));
  if (f.practice.length) {
    root.append(h('section', {},
      h('h3', {}, '練習のヒント'),
      h('ol', {}, ...f.practice.map((p) =>
        h('li', {}, h('strong', {}, `${p.title}(${p.minutes}分)`), h('p', {}, p.how)))),
      h('p', {}, PRACTICE_CADENCE),
    ));
  }
  root.append(h('p', { class: 'notice' }, STOP_NOTICE));
  if (opts.canRecordMore) root.append(micButton('もう1セット録音する', opts.onAgain));
  root.append(button(HOME_LABEL, opts.onHome));
  root.append(h('footer', { class: 'footer' }, FIXED_FOOTER));
  return root;
}

const MIC_COPY: Record<MicError, { title: string; reason: string; todo: string }> = {
  denied: {
    title: 'マイクが許可されていません',
    reason: 'このページからマイクを使うことが許可されていません。',
    todo: 'ブラウザの設定でマイクを許可してから、もう一度お試しください。',
  },
  'no-device': {
    title: 'マイクが見つかりません',
    reason: 'マイクが見つからない、または使える状態ではないようです。',
    todo: 'マイクがつながっているか確認し、ほかのアプリで使っていないか見直してください。',
  },
  'insecure-context': {
    title: '安全な接続ではありません',
    reason: 'マイクは、安全な接続のページでのみ使えます。',
    todo: 'https で始まるアドレスでこのページを開き直してください。',
  },
  unsupported: {
    title: 'このブラウザでは録音できません',
    reason: 'お使いのブラウザは、このページの録音に必要な機能に対応していません。',
    todo: '別のブラウザや新しい版をお試しください。',
  },
};

export function renderMicError(e: MicError, onBack: () => void): HTMLElement {
  const c = MIC_COPY[e];
  return h('section', { class: 'screen notice-screen' },
    h('h1', {}, c.title),
    h('p', {}, c.reason),
    h('p', {}, c.todo),
    button('説明にもどる', onBack, 'btn primary'),
  );
}

const RETRY_COPY: Record<GateReason | 'interrupted', string> = {
  'too-noisy': '周りの音が大きいようです。もっと静かな場所へ移動して、録り直してください。「どうぞ」が出てから話し始めてください。',
  clipping: '音が大きすぎて割れていました。マイクから少し離れて、小さめの声でお試しください。',
  'too-quiet': '声が小さく録音されました。マイクに少し近づいて、もう一度お試しください。',
  'no-voice': '声が聞き取れませんでした。マイクの位置や設定を確認して、もう一度お試しください。',
  'vowel-too-short': '「あー」が短めでした。もう少し長く、約5秒のばしてください。',
  'vowel-unstable': '「あー」の高さや大きさが揺れていました。できるだけ一定の高さと大きさでのばしてください。',
  'sentence-too-short': '読み上げが短めでした。文を最後まで読み上げてください。',
  interrupted: '録音が中断されました。もう一度録音してください。',
};

/** One neutral line with the measured levels, for 'too-noisy' and 'too-quiet' only. */
function retryDetailText(reason: GateReason | 'interrupted', d: GateDetail | undefined): string | null {
  if (!d) return null;
  const parts: string[] = [];
  const fin = (v: number | null): v is number => v !== null && Number.isFinite(v);
  if (reason === 'too-noisy') {
    if (fin(d.snrDb)) parts.push(`録音前の静けさとの差は約 ${Math.round(d.snrDb)} dB でした(${GATE.snrRejectDb} dB 以上が目安)。`);
    if (fin(d.noiseFloorDbfs)) parts.push(`録音前の音の大きさは約 ${Math.round(d.noiseFloorDbfs)} dBFS でした。`);
  } else if (reason === 'too-quiet') {
    if (fin(d.peakDbfs)) parts.push(`声の大きさ(最大)は約 ${Math.round(d.peakDbfs)} dBFS でした(${GATE.peakQuietDbfs} dBFS 以上が目安)。`);
  }
  return parts.length ? `測った値の目安:${parts.join('')}` : null;
}

export function renderRetry(
  reason: GateReason | 'interrupted', onRetry: () => void, onHome: () => void,
  detail?: GateDetail,
): HTMLElement {
  const detailText = retryDetailText(reason, detail);
  const screen = h('section', { class: 'screen notice-screen' },
    h('h1', {}, 'もう一度録音しましょう'),
    h('p', {}, RETRY_COPY[reason]),
  );
  if (detailText) screen.append(h('p', { class: 'retry-detail' }, detailText));
  screen.append(
    micButton('もう一度録音する', onRetry),
    button(HOME_LABEL, onHome),
  );
  return screen;
}
