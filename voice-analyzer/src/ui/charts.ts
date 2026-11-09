import { BAND_COLORS, BAND_EDGES_HZ } from '../diagnosis/config';

const NS = 'http://www.w3.org/2000/svg';

export function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K, attrs: Record<string, string | number> = {}, text?: string,
): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  return e;
}

function clean(share: number[]): number[] {
  return BAND_COLORS.map((_, i) => {
    const v = share[i];
    return Number.isFinite(v) && v > 0 ? v : 0;
  });
}

const pctText = (frac: number) => (frac < 0.005 ? '1%未満' : `${Math.round(frac * 100)}%`);
const bandLabel = (i: number) => `${BAND_EDGES_HZ[i]}〜${BAND_EDGES_HZ[i + 1]} Hz`;

const BAR = { w: 320, h: 210, left: 34, right: 312, y0: 170, y60: 20, max: 60 };

/** 12 bars; the largest share maps to 60 on a 0-60 axis. */
export function renderBarChart(bandShare: number[]): SVGSVGElement {
  const s = clean(bandShare);
  const peak = Math.max(...s);
  const svg = svgEl('svg', {
    viewBox: `0 0 ${BAR.w} ${BAR.h}`, role: 'img', class: 'chart chart-bar',
    'aria-label': '12の周波数帯ごとの相対的な強さの棒グラフ。左が低い帯域、右が高い帯域です。',
  });
  svg.appendChild(svgEl('title', {}, '帯域ごとの相対的な強さ(棒グラフ)'));
  const full = BAR.y0 - BAR.y60;
  for (const t of [0, 20, 40, 60]) {
    const y = BAR.y0 - (t / BAR.max) * full;
    svg.appendChild(svgEl('line', {
      x1: BAR.left, x2: BAR.right, y1: y, y2: y, class: 'axis', 'data-tick': t,
    }));
    svg.appendChild(svgEl('text', { x: BAR.left - 6, y: y + 4, 'text-anchor': 'end', class: 'tick' }, String(t)));
  }
  const slot = (BAR.right - BAR.left) / 12;
  const bw = slot * 0.72;
  s.forEach((v, i) => {
    const value = peak > 0 ? (v / peak) * BAR.max : 0;
    const h = (value / BAR.max) * full;
    const rect = svgEl('rect', {
      class: 'bar', x: BAR.left + slot * i + (slot - bw) / 2, y: BAR.y0 - h, width: bw, height: h,
      fill: BAND_COLORS[i],
    });
    rect.appendChild(svgEl('title', {}, `${bandLabel(i)}`));
    svg.appendChild(rect);
    svg.appendChild(svgEl('text', {
      x: BAR.left + slot * i + slot / 2, y: BAR.y0 + 16, 'text-anchor': 'middle', class: 'tick',
    }, String(i + 1)));
  });
  svg.appendChild(svgEl('text', { x: (BAR.left + BAR.right) / 2, y: BAR.h - 8, 'text-anchor': 'middle', class: 'tick' },
    '帯域の番号(1が低域、12が高域)'));
  return svg;
}

const PIE = { size: 200, c: 100, r: 90 };

/** One wedge per positive band; labels the rounded percentage when it is at least 3%. */
export function renderPieChart(bandShare: number[]): SVGSVGElement {
  const s = clean(bandShare);
  const total = s.reduce((a, b) => a + b, 0);
  const svg = svgEl('svg', {
    viewBox: `0 0 ${PIE.size} ${PIE.size}`, role: 'img', class: 'chart chart-pie',
    'aria-label': '12の周波数帯の割合の円グラフ。',
  });
  svg.appendChild(svgEl('title', {}, '帯域ごとの割合(円グラフ)'));
  if (total <= 0) {
    svg.appendChild(svgEl('circle', { cx: PIE.c, cy: PIE.c, r: PIE.r, class: 'pie-empty' }));
    return svg;
  }
  const { c, r } = PIE;
  const pt = (a: number, rad: number): [number, number] => [c + rad * Math.sin(a), c - rad * Math.cos(a)];
  const labels: SVGTextElement[] = [];
  let start = 0;
  s.forEach((v, i) => {
    if (v <= 0) return;
    const frac = v / total;
    const end = start + frac * 2 * Math.PI;
    let d: string;
    if (frac >= 0.9999) {
      d = `M ${c + r} ${c} A ${r} ${r} 0 1 1 ${c - r} ${c} A ${r} ${r} 0 1 1 ${c + r} ${c} Z`;
    } else {
      const [x1, y1] = pt(start, r);
      const [x2, y2] = pt(end, r);
      d = `M ${c} ${c} L ${x1.toFixed(3)} ${y1.toFixed(3)} A ${r} ${r} 0 ${frac > 0.5 ? 1 : 0} 1 ${x2.toFixed(3)} ${y2.toFixed(3)} Z`;
    }
    const path = svgEl('path', { d, fill: BAND_COLORS[i], class: 'wedge' });
    path.appendChild(svgEl('title', {}, `${bandLabel(i)} ${pctText(frac)}`));
    svg.appendChild(path);
    if (frac >= 0.03) {
      const [lx, ly] = frac >= 0.9999 ? [c, c] : pt((start + end) / 2, r * 0.68);
      labels.push(svgEl('text', {
        x: lx.toFixed(3), y: (ly + 3.5).toFixed(3), 'text-anchor': 'middle', class: 'pie-label',
      }, `${Math.round(frac * 100)}%`));
    }
    start = end;
  });
  labels.forEach((t) => svg.appendChild(t));
  return svg;
}
