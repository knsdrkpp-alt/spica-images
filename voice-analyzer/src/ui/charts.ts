import { SPECTRUM_FLOOR_DB } from '../dsp/spectrum';

const NS = 'http://www.w3.org/2000/svg';

export function svgEl<K extends keyof SVGElementTagNameMap>(
  tag: K, attrs: Record<string, string | number> = {}, text?: string,
): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  if (text !== undefined) e.textContent = text;
  return e;
}

export interface ChartColor {
  name: string;
  css: string;
}

export interface ChartOptions {
  /** One entry per value, LOW to HIGH frequency. */
  colors: ChartColor[];
}

function clean(values: number[], n: number): number[] {
  return Array.from({ length: n }, (_, i) => {
    const v = values[i];
    return Number.isFinite(v) && v > 0 ? v : 0;
  });
}

const fmt = (v: number) => v.toFixed(2);
const pctText = (frac: number) => (frac > 0 && frac < 0.005 ? '1%未満' : `${Math.round(frac * 100)}%`);

/** 「赤22、橙10、…」 in the given order. */
function listText(colors: ChartColor[], values: number[], order: number[]): string {
  return order.map((i) => `${colors[i].name}${Math.round(values[i])}`).join('、');
}

const BAR = { w: 400, h: 230, left: 16, right: 384, top: 34, base: 192 };

/**
 * One bar per colour, LOW (left) to HIGH (right), each with its integer value above it and its
 * colour name below. The largest value takes the full height.
 */
export function renderBarChart(values: number[], opts: ChartOptions): SVGSVGElement {
  const { colors } = opts;
  const n = colors.length;
  const s = clean(values, n);
  const peak = Math.max(0, ...s);
  const order = s.map((_, i) => i);
  const svg = svgEl('svg', {
    viewBox: `0 0 ${BAR.w} ${BAR.h}`, role: 'img', class: 'chart chart-bar',
    'aria-label': `${n}色の割合の棒グラフ。左が低い音、右が高い音です。${listText(colors, s, order)}`,
  });
  svg.appendChild(svgEl('title', {}, '色ごとの割合(棒グラフ)'));
  const slot = (BAR.right - BAR.left) / n;
  const bw = slot * (n > 6 ? 0.7 : 0.62);
  const big = n <= 6;
  svg.appendChild(svgEl('line', {
    x1: BAR.left, x2: BAR.right, y1: BAR.base, y2: BAR.base, class: 'axis',
  }));
  s.forEach((v, i) => {
    const h = peak > 0 ? (v / peak) * (BAR.base - BAR.top) : 0;
    const cx = BAR.left + slot * i + slot / 2;
    const rect = svgEl('rect', {
      class: 'bar', x: fmt(cx - bw / 2), y: fmt(BAR.base - h), width: fmt(bw), height: fmt(h),
      fill: colors[i].css,
    });
    rect.appendChild(svgEl('title', {}, `${colors[i].name} ${Math.round(v)}`));
    svg.appendChild(rect);
    svg.appendChild(svgEl('text', {
      x: fmt(cx), y: fmt(BAR.base - h - 6), 'text-anchor': 'middle', class: 'bar-value',
      'font-size': big ? 15 : 12,
    }, String(Math.round(v))));
    svg.appendChild(svgEl('text', {
      x: fmt(cx), y: BAR.base + 20, 'text-anchor': 'middle', class: 'bar-name',
      'font-size': big ? 14 : 10,
    }, colors[i].name));
  });
  return svg;
}

const PIE = { size: 300, c: 150, r: 125 };

/**
 * One wedge per positive value, clockwise from 12 o'clock in HIGH to LOW order (the same order as
 * the circle chart). Wedges of at least 3% are labelled with their rounded percentage.
 */
export function renderPieChart(values: number[], opts: ChartOptions): SVGSVGElement {
  const { colors } = opts;
  const n = colors.length;
  const s = clean(values, n);
  const total = s.reduce((a, b) => a + b, 0);
  const order = s.map((_, i) => n - 1 - i);
  const svg = svgEl('svg', {
    viewBox: `0 0 ${PIE.size} ${PIE.size}`, role: 'img', class: 'chart chart-pie',
    'aria-label': `${n}色の割合の円グラフ。上から時計回りに高い音から低い音の順です。${
      total > 0 ? listText(colors, s.map((v) => (v / total) * 100), order) : ''}`,
  });
  svg.appendChild(svgEl('title', {}, '色ごとの割合(円グラフ)'));
  if (total <= 0) {
    svg.appendChild(svgEl('circle', { cx: PIE.c, cy: PIE.c, r: PIE.r, class: 'pie-empty' }));
    return svg;
  }
  const { c, r } = PIE;
  const pt = (a: number, rad: number): [number, number] => [c + rad * Math.sin(a), c - rad * Math.cos(a)];
  const labels: SVGTextElement[] = [];
  let start = 0;
  for (const i of order) {
    const v = s[i];
    if (v <= 0) continue;
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
    const path = svgEl('path', { d, fill: colors[i].css, class: 'wedge' });
    path.appendChild(svgEl('title', {}, `${colors[i].name} ${pctText(frac)}`));
    svg.appendChild(path);
    if (frac >= 0.03) {
      const [lx, ly] = frac >= 0.9999 ? [c, c] : pt((start + end) / 2, r * 0.66);
      labels.push(svgEl('text', {
        x: lx.toFixed(3), y: (ly + 5).toFixed(3), 'text-anchor': 'middle', class: 'pie-label',
        'font-size': n <= 6 ? 15 : 12,
      }, `${Math.round(frac * 100)}%`));
    }
    start = end;
  }
  labels.forEach((t) => svg.appendChild(t));
  return svg;
}

export interface PolarRing {
  /** 'outer' or 'inner'. */
  id: string;
  label: string;
  curveDb: number[];
}

/** Ring radii (viewBox units): the curve's level maps from rBase (peak - 60 dB or less) to rMax (peak). */
export const RING_GEOMETRY: Record<string, { rBase: number; rMax: number; width: number }> = {
  outer: { rBase: 110, rMax: 158, width: 1.6 },
  inner: { rBase: 55, rMax: 88, width: 1.4 },
};

/**
 * Start angle (degrees, SVG convention: 0 = 3 o'clock, clockwise positive) of the highest-frequency
 * sector. -150 puts it at the top-left (10 o'clock). The same start serves 12 colours: every sector
 * boundary then falls on a multiple of 30 degrees from 12 o'clock, so both layouts are mirror-symmetric
 * about the vertical axis and each 6-colour sector splits into its two 12-colour bands.
 */
export const POLAR_START_DEG = -150;

const POLAR = { size: 400, c: 200, numberR: 176, divider: 168 };

/** Small deterministic generator for the background stars (same picture on every render). */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * The spectrum in polar form: angle = frequency, radius = level. N colour sectors (N = colors.length),
 * the highest frequency starting at POLAR_START_DEG and running clockwise toward lower frequency.
 * Each given ring is drawn as one polyline per sector; each sector's share is printed outside it.
 */
export function renderPolarChart(
  rings: PolarRing[], shares: number[], opts: ChartOptions,
): SVGSVGElement {
  const { colors } = opts;
  const n = colors.length;
  const s = clean(shares, n);
  const { c } = POLAR;
  const highToLow = s.map((_, i) => n - 1 - i);
  const svg = svgEl('svg', {
    viewBox: `0 0 ${POLAR.size} ${POLAR.size}`, role: 'img', class: 'chart chart-polar',
    'aria-label': `${n}色の割合:${listText(colors, s, highToLow)}`,
  });
  svg.appendChild(svgEl('title', {}, '周波数ごとの強さを円にしたグラフ'));

  const rnd = lcg(7);
  const stars = svgEl('g', { class: 'stars', 'aria-hidden': 'true' });
  for (let i = 0; i < 70; i++) {
    stars.appendChild(svgEl('circle', {
      cx: fmt(rnd() * POLAR.size), cy: fmt(rnd() * POLAR.size), r: fmt(rnd() * 1.1 + 0.3),
      opacity: fmt(0.2 + rnd() * 0.45),
    }));
  }
  svg.appendChild(stars);

  const guides = svgEl('g', { class: 'guides', 'aria-hidden': 'true' });
  for (const r of [RING_GEOMETRY.outer.rMax, RING_GEOMETRY.outer.rBase, RING_GEOMETRY.inner.rBase]) {
    guides.appendChild(svgEl('circle', { cx: c, cy: c, r, class: 'guide' }));
  }
  const rad = (deg: number) => (deg * Math.PI) / 180;
  for (let k = 0; k < n; k++) {
    const a = rad(POLAR_START_DEG + (360 * k) / n);
    guides.appendChild(svgEl('line', {
      x1: c, y1: c, x2: fmt(c + POLAR.divider * Math.cos(a)), y2: fmt(c + POLAR.divider * Math.sin(a)),
      class: 'divider',
    }));
  }
  svg.appendChild(guides);

  for (const ring of rings) {
    const geo = RING_GEOMETRY[ring.id] ?? RING_GEOMETRY.outer;
    const pts = ring.curveDb.length;
    const vals = Array.from({ length: pts }, (_, i) =>
      (Number.isFinite(ring.curveDb[i]) ? ring.curveDb[i] : SPECTRUM_FLOOR_DB));
    const peak = Math.max(SPECTRUM_FLOOR_DB, ...vals);
    const silent = !(peak > SPECTRUM_FLOOR_DB);
    // Point i (LOW to HIGH) sits (pts - 1 - i + 0.5) / pts of a turn clockwise from the start.
    const xy = (i: number): string => {
      const level = silent ? 0 : Math.min(1, Math.max(0, (vals[i] - (peak - 60)) / 60));
      const r = geo.rBase + (geo.rMax - geo.rBase) * level;
      const a = rad(POLAR_START_DEG + (360 * (pts - 1 - i + 0.5)) / pts);
      return `${(c + r * Math.cos(a)).toFixed(1)},${(c + r * Math.sin(a)).toFixed(1)}`;
    };
    const g = svgEl('g', { class: `ring ring-${ring.id}`, 'data-ring': ring.id });
    g.appendChild(svgEl('title', {}, ring.label));
    const per = pts / n;
    for (let k = 0; k < n; k++) {
      const from = Math.round(k * per);
      const to = Math.min(pts - 1, Math.round((k + 1) * per)); // include the next sector's first point
      const line: string[] = [];
      for (let i = from; i <= to; i++) line.push(xy(i));
      g.appendChild(svgEl('polyline', {
        points: line.join(' '), fill: 'none', stroke: colors[k].css, 'stroke-width': geo.width,
        'stroke-linejoin': 'round', class: 'ring-line',
      }));
    }
    svg.appendChild(g);
  }

  const numbers = svgEl('g', { class: 'shares' });
  const size = n <= 6 ? 26 : 17;
  for (let k = 0; k < n; k++) {
    const a = rad(POLAR_START_DEG + (360 * (n - 1 - k + 0.5)) / n);
    numbers.appendChild(svgEl('text', {
      x: fmt(c + POLAR.numberR * Math.cos(a)), y: fmt(c + POLAR.numberR * Math.sin(a) + size * 0.35),
      'text-anchor': 'middle', 'font-size': size, fill: colors[k].css, class: 'share-number',
    }, String(Math.round(s[k]))));
  }
  svg.appendChild(numbers);
  return svg;
}
