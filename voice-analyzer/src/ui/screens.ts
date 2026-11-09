import { BAND_COLORS, BAND_EDGES_HZ, READING_TEXT } from '../diagnosis/config';
import { FIXED_FOOTER, STOP_NOTICE } from '../diagnosis/copy';
import type { Feedback } from '../diagnosis/feedback';
import type { GateReason } from '../diagnosis/gate';
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
    button('声を録音する', () => onStart(selected()), 'btn primary'),
  );
}

export interface RecordingView {
  el: HTMLElement;
  setPhase(p: 'vowel' | 'sentence'): void;
  setReady(ready: boolean): void;
  setWave(w: Float32Array): void;
}

const WAVE = { w: 300, h: 80 };

export function renderRecording(onStop: () => void): RecordingView {
  const status = h('p', { class: 'status', role: 'status' });
  const prompt = h('p', { class: 'prompt' });
  const sub = h('p', { class: 'note' });
  const svg = svgEl('svg', {
    viewBox: `0 0 ${WAVE.w} ${WAVE.h}`, class: 'wave', role: 'img', 'aria-label': '録音中の声の波形',
  });
  const line = svgEl('polyline', { fill: 'none', points: `0,${WAVE.h / 2} ${WAVE.w},${WAVE.h / 2}` });
  svg.appendChild(line);
  const stop = button('終了', onStop, 'btn primary');
  stop.hidden = true;

  const view = h('section', { class: 'screen recording' },
    h('h1', {}, '録音中'), status, prompt, sub, svg, stop);

  function setPhase(p: 'vowel' | 'sentence'): void {
    if (p === 'vowel') {
      prompt.textContent = '「あー」と、楽な声で約5秒のばしてください';
      sub.textContent = '';
    } else {
      prompt.textContent = READING_TEXT;
      sub.textContent = 'ふだんの話し方で読み上げてください';
    }
    stop.hidden = p !== 'sentence';
  }
  function setReady(ready: boolean): void {
    status.textContent = ready ? 'どうぞ' : '準備しています。静かにお待ちください';
  }
  function setWave(w: Float32Array): void {
    const n = Math.min(w.length, WAVE.w);
    if (n === 0) {
      line.setAttribute('points', `0,${WAVE.h / 2} ${WAVE.w},${WAVE.h / 2}`);
      return;
    }
    const pts: string[] = [];
    for (let i = 0; i < n; i++) {
      const raw = w[Math.floor((i * w.length) / n)];
      const v = Number.isFinite(raw) ? Math.max(-1, Math.min(1, raw)) : 0;
      pts.push(`${((i / Math.max(1, n - 1)) * WAVE.w).toFixed(1)},${(WAVE.h / 2 - v * (WAVE.h / 2 - 2)).toFixed(1)}`);
    }
    line.setAttribute('points', pts.join(' '));
  }
  setPhase('vowel');
  setReady(false);
  return { el: view, setPhase, setReady, setWave };
}

const hzRange = (i: number) => `${BAND_EDGES_HZ[i]}〜${BAND_EDGES_HZ[i + 1]} Hz`;

export function renderResult(
  f: Feedback,
  bandShare: number[],
  opts: { provisionalNorms: boolean; onAgain: () => void; canRecordMore: boolean },
): HTMLElement {
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
  if (opts.provisionalNorms) {
    root.append(h('p', { class: 'notice' }, 'いまは仮の基準を使っているため、今後の調整で表示が変わることがあります。'));
  }
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
  if (f.strengths.length) root.append(h('section', {}, h('h3', {}, 'よく出ている点'), list(f.strengths)));
  if (f.focus.length) root.append(h('section', {}, h('h3', {}, '意識してみるとよい点'), list(f.focus)));
  if (f.practice.length) {
    root.append(h('section', {},
      h('h3', {}, '練習のヒント'),
      h('ol', {}, ...f.practice.map((p) =>
        h('li', {}, h('strong', {}, `${p.title}(${p.minutes}分)`), h('p', {}, p.how)))),
    ));
  }
  root.append(h('p', { class: 'notice' }, STOP_NOTICE));
  if (opts.canRecordMore) root.append(button('もう1セット録音する', opts.onAgain, 'btn primary'));
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
  'too-noisy': '周りの音が大きいようです。もっと静かな場所へ移動して、録り直してください。',
  clipping: '音が大きすぎて割れていました。マイクから少し離れて、小さめの声でお試しください。',
  'too-quiet': '声が小さく録音されました。マイクに少し近づいて、もう一度お試しください。',
  'no-voice': '声が聞き取れませんでした。マイクの位置や設定を確認して、もう一度お試しください。',
  'vowel-too-short': '「あー」が短めでした。もう少し長く、約5秒のばしてください。',
  'vowel-unstable': '「あー」の高さや大きさが揺れていました。できるだけ一定の高さと大きさでのばしてください。',
  'sentence-too-short': '読み上げが短めでした。文を最後まで読み上げてください。',
  interrupted: '録音が中断されました。もう一度録音してください。',
};

export function renderRetry(reason: GateReason | 'interrupted', onRetry: () => void): HTMLElement {
  return h('section', { class: 'screen notice-screen' },
    h('h1', {}, 'もう一度録音しましょう'),
    h('p', {}, RETRY_COPY[reason]),
    button('もう一度録音する', onRetry, 'btn primary'),
  );
}
