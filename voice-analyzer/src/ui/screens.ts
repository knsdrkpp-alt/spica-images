import { colorShares, colorsFor, rankColors } from '../diagnosis/colors';
import { GATE, READING_TEXT } from '../diagnosis/config';
import { FIXED_FOOTER, MULTI_SET_NOTE, PRACTICE_CADENCE, STOP_NOTICE } from '../diagnosis/copy';
import type { Feedback } from '../diagnosis/feedback';
import type { GateDetail, GateReason } from '../diagnosis/gate';
import type { MicError } from '../audio/capture';
import type { Sex } from '../types';
import { parseBirthDate, type BirthDate } from '../numerology/life-path';
import type { Reading } from '../numerology/reading';
import { BAND_NOTES, COLOR6_NOTES } from './band-notes';
import {
  renderBarChart, renderPieChart, renderPolarChart, svgEl, type PolarRing,
} from './charts';

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

function todayIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function renderStart(onStart: (sex: Sex, birth: BirthDate | null) => void): HTMLElement {
  const sexOptions: [Sex, string][] = [['unspecified', '答えない'], ['female', '女性'], ['male', '男性']];
  const radios = sexOptions.map(([value, label]) => {
    const input = h('input', { type: 'radio', name: 'sex', value });
    if (value === 'unspecified') input.checked = true;
    return { input, node: h('label', { class: 'radio' }, input, label) };
  });
  const selected = (): Sex =>
    (radios.find((r) => r.input.checked)?.input.value as Sex | undefined) ?? 'unspecified';

  const birthInput = h('input', { type: 'date', autocomplete: 'off', id: 'birth-date', name: 'birth', min: '1900-01-01', max: todayIso() });
  const birth = (): BirthDate | null => parseBirthDate(birthInput.value);

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
    h('div', { class: 'birth' },
      h('label', { for: 'birth-date' }, '生年月日(入力は任意)'),
      birthInput,
      h('p', { class: 'note' }, '入力した日付は、端末の外に送らず、保存もしません。入力しなくても使えます。'),
    ),
    micButton('声を録音する', () => onStart(selected(), birth())),
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
  /** 「声と数のあいだ」: shown only when a birth date was given and the spectrum was usable. */
  reading?: Reading | null;
}

function renderColorReading(label: string, glossLabel: string, c: Reading['strongest']): HTMLElement {
  return h('div', { class: 'reading-color' },
    h('p', { class: 'reading-color-head' }, `${label}:${c.name}(約${c.share}%)`),
    h('p', {}, glossLabel, h('strong', {}, c.title)),
    h('p', {}, c.text),
  );
}

/** The optional 「声と数のあいだ」 card. Text only (textContent), neutral styling. */
export function renderReading(r: Reading): HTMLElement {
  return h('section', { class: 'reading-card', role: 'region', 'aria-label': '声と数のあいだ(読み物)' },
    h('h3', {}, '声と数のあいだ', h('span', { class: 'tag', 'aria-hidden': 'true' }, '読み物')),
    h('p', { class: 'reading-disclaimer' }, r.disclaimer),
    h('div', { class: 'reading-number', role: 'group', 'aria-label': `数秘術の数 ${r.life}:${r.numberTitle}` },
      h('span', { class: 'reading-num', 'aria-hidden': 'true' }, String(r.life)),
      h('span', { class: 'reading-num-title', 'aria-hidden': 'true' }, r.numberTitle),
    ),
    h('p', {}, r.numberText),
    h('h4', {}, '今回の録音の色の割合'),
    renderColorReading('多めだった帯', '多めだった帯の見立て:', r.strongest),
    renderColorReading('少なめだった帯', '少なめだった帯の見立て:', r.weakest),
    h('h4', {}, 'ふりかえりの問い'),
    h('ol', {}, ...r.questions.map((q) => h('li', {}, q))),
  );
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

/** Averaged spectrum curves (240 points, dB) shown on the result screen. */
export interface ResultCurves {
  /** The read-aloud sentence: outer ring, and the source of the percentages. */
  sentenceDb: number[];
  /** The sustained 「あー」: inner ring. */
  vowelDb: number[];
}

export const RING_LABELS = { outer: '外側:文の読み上げ', inner: '内側:「あー」' } as const;

interface GraphState {
  bands: 6 | 12;
  outer: boolean;
  inner: boolean;
}

const GRAPH_GUIDE =
  '色は、低い音(赤)から高い音(紫)の順に並んでいます。円の外の数字は、それぞれの色の割合で、合計は100です。'
  + '外側の輪は文の読み上げ(ふだんの話し声)、内側の輪は「あー」とのばした声の、周波数ごとの強さの形です。'
  + '割合はこのアプリ独自の計算によるもので、録音した機種やマイクによって変わる、おおまかな目安です。';

function darkCard(...children: Child[]): HTMLElement {
  return h('div', { class: 'graph-card' }, ...children);
}

/** Legend of the current colours; tapping one shows its one-line note. */
function renderLegend(bands: 6 | 12): HTMLElement {
  const colors = colorsFor(bands);
  const notes = bands === 6 ? COLOR6_NOTES : BAND_NOTES;
  const note = h('p', { class: 'band-note', role: 'status' });
  let open = -1;
  const label = (i: number) => `${colors[i].name}(${colors[i].lowHz}〜${colors[i].highHz} Hz)`;
  const buttons = colors.map((color, i) => {
    const swatch = h('span', { class: 'swatch', 'aria-hidden': 'true' });
    swatch.style.background = color.css;
    const b = h('button', { type: 'button', class: 'legend-item', 'aria-expanded': 'false' }, swatch, label(i));
    b.addEventListener('click', () => {
      open = open === i ? -1 : i;
      buttons.forEach((x, j) => x.setAttribute('aria-expanded', String(j === open)));
      note.textContent = open === -1 ? '' : `${label(i)}:${notes[i]}`;
    });
    return b;
  });
  return h('section', { class: 'legend-section' },
    h('h3', {}, '色の凡例'),
    h('p', { class: 'note' }, '色をタップすると、その帯域の一般的な傾向を表示します。音響的な裏づけは弱い、一般的な目安です。'),
    h('div', { class: 'legend' }, ...buttons),
    note,
  );
}

/**
 * The colour graphs with their controls. Toggling the colour count or a ring rebuilds only the
 * graphs below the controls (renderResultGraphs), never the whole result screen.
 */
function renderGraphs(curves: ResultCurves): HTMLElement {
  const state: GraphState = { bands: 6, outer: true, inner: true };
  const body = h('div', { class: 'graphs-body' });

  const modeButtons = ([6, 12] as const).map((bands) => {
    const b = h('button', { type: 'button', class: 'toggle', 'aria-pressed': 'false' }, `${bands}色`);
    b.addEventListener('click', () => {
      if (state.bands === bands) return;
      state.bands = bands;
      renderResultGraphs();
    });
    return { bands, b };
  });
  const ringBox = (key: 'outer' | 'inner') => {
    const input = h('input', { type: 'checkbox', name: `ring-${key}` });
    input.checked = true;
    input.addEventListener('change', () => {
      state[key] = input.checked;
      renderResultGraphs();
    });
    const line = h('span', { class: `ring-swatch ring-swatch-${key}`, 'aria-hidden': 'true' });
    return h('label', { class: 'check' }, input, line, RING_LABELS[key]);
  };

  function renderResultGraphs(): void {
    for (const m of modeButtons) m.b.setAttribute('aria-pressed', String(m.bands === state.bands));
    const colors = colorsFor(state.bands);
    const shares = colorShares(curves.sentenceDb, state.bands);
    const rings: PolarRing[] = [];
    if (state.outer) rings.push({ id: 'outer', label: RING_LABELS.outer, curveDb: curves.sentenceDb });
    if (state.inner) rings.push({ id: 'inner', label: RING_LABELS.inner, curveDb: curves.vowelDb });
    const ranked = shares.some((v) => v > 0)
      ? `強い順:${rankColors(shares, colors.map((c) => c.name)).join(' → ')}`
      : '強い順:今回の録音からは求められませんでした';
    body.replaceChildren(
      darkCard(renderPolarChart(rings, shares, { colors })),
      h('p', { class: 'rank' }, ranked),
      h('p', { class: 'graph-guide' }, GRAPH_GUIDE),
      darkCard(renderBarChart(shares, { colors })),
      darkCard(renderPieChart(shares, { colors })),
      renderLegend(state.bands),
    );
  }

  const controls = h('div', { class: 'graph-controls' },
    h('fieldset', { class: 'control-group' },
      h('legend', {}, '色の数'),
      h('div', { class: 'toggles' }, ...modeButtons.map((m) => m.b)),
    ),
    h('fieldset', { class: 'control-group' },
      h('legend', {}, '表示する輪'),
      ringBox('outer'),
      ringBox('inner'),
    ),
  );
  renderResultGraphs();
  return h('section', { class: 'graphs' }, controls, body);
}

export function renderResult(f: Feedback, curves: ResultCurves, opts: ResultOptions): HTMLElement {
  const root = h('article', { class: 'screen result' },
    h('h2', { class: 'headline' }, f.headline),
    h('p', {}, f.tendency),
  );
  if (f.sets >= 2) root.append(h('p', { class: 'note' }, MULTI_SET_NOTE));
  if (opts.provisionalNorms) {
    root.append(h('p', { class: 'notice' }, 'いまは仮の基準を使っているため、今後の調整で表示が変わることがあります。'));
  }
  for (const n of opts.notices) root.append(h('p', { class: 'notice' }, n));
  root.append(renderGraphs(curves));
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
  if (opts.reading) root.append(renderReading(opts.reading));
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
