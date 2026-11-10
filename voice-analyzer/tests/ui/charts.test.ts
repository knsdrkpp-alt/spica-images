import { describe, it, expect } from 'vitest';
import {
  renderBarChart, renderPieChart, renderPolarChart, POLAR_START_DEG, RING_GEOMETRY,
} from '../../src/ui/charts';
import { COLORS_6, COLORS_12 } from '../../src/diagnosis/colors';
import { findBannedWords } from '../../src/diagnosis/feedback';

const six = { colors: COLORS_6 };
const twelve = { colors: COLORS_12 };
const SHARES6 = [22, 10, 7, 18, 13, 30]; // LOW to HIGH: 赤 橙 黄 緑 青 紫

function allAttrs(root: Element): string[] {
  const out: string[] = [];
  for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
    for (const a of Array.from(el.attributes)) out.push(a.value);
    out.push(el.textContent ?? '');
  }
  return out;
}
const noNaN = (el: Element) => expect(allAttrs(el).some((v) => v.includes('NaN') || v.includes('Infinity'))).toBe(false);

describe('renderBarChart', () => {
  it('draws one bar per colour LOW to HIGH, the largest at full height, values and names as text', () => {
    const svg = renderBarChart(SHARES6, six);
    const rects = Array.from(svg.querySelectorAll('rect.bar'));
    expect(rects).toHaveLength(6);
    expect(rects.map((r) => r.getAttribute('fill'))).toEqual(COLORS_6.map((c) => c.css));
    const hs = rects.map((r) => Number(r.getAttribute('height')));
    expect(hs.indexOf(Math.max(...hs))).toBe(5);
    expect(hs[0] / hs[5]).toBeCloseTo(22 / 30, 2);
    const xs = rects.map((r) => Number(r.getAttribute('x')));
    expect([...xs].sort((a, b) => a - b)).toEqual(xs);
    expect(Array.from(svg.querySelectorAll('.bar-value')).map((t) => t.textContent)).toEqual(SHARES6.map(String));
    expect(Array.from(svg.querySelectorAll('.bar-name')).map((t) => t.textContent)).toEqual(['赤', '橙', '黄', '緑', '青', '紫']);
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toContain('赤22');
  });
  it('12 colours give 12 bars', () => {
    const svg = renderBarChart(new Array(12).fill(0).map((_, i) => i + 1), twelve);
    expect(svg.querySelectorAll('rect.bar')).toHaveLength(12);
  });
  it('all-zero input gives zero-height bars and no NaN', () => {
    const svg = renderBarChart(new Array(6).fill(0), six);
    const hs = Array.from(svg.querySelectorAll('rect.bar')).map((r) => Number(r.getAttribute('height')));
    expect(hs).toEqual(new Array(6).fill(0));
    noNaN(svg);
  });
});

describe('renderPieChart', () => {
  const nums = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  it('draws wedges clockwise from 12 o\'clock in HIGH to LOW order, labelled with percentages', () => {
    const svg = renderPieChart(SHARES6, six);
    const paths = Array.from(svg.querySelectorAll('path'));
    expect(paths).toHaveLength(6);
    expect(paths.map((p) => p.getAttribute('fill'))).toEqual([...COLORS_6].reverse().map((c) => c.css));
    const first = nums(paths[0].getAttribute('d')!);
    expect(first[2]).toBeCloseTo(150); expect(first[3]).toBeCloseTo(25); // starts at the top
    expect(first[8]).toBe(1); // clockwise sweep
    expect(Array.from(svg.querySelectorAll('.pie-label')).map((t) => t.textContent))
      .toEqual(['30%', '13%', '18%', '7%', '10%', '22%']);
    expect(svg.getAttribute('role')).toBe('img');
  });
  it('labels only wedges of at least 3%, and tiny wedges read 1%未満 in titles', () => {
    const svg = renderPieChart([0.4, 0, 0, 0, 2, 97.6], six);
    expect(svg.querySelectorAll('path')).toHaveLength(3);
    expect(Array.from(svg.querySelectorAll('.pie-label')).map((t) => t.textContent)).toEqual(['98%']);
    expect(Array.from(svg.querySelectorAll('path title')).map((t) => t.textContent)).toContain('赤 1%未満');
  });
  it('a share over one half uses the large arc', () => {
    const ds = Array.from(renderPieChart([30, 0, 0, 0, 0, 70], six).querySelectorAll('path')).map((p) => nums(p.getAttribute('d')!));
    expect(ds[0][7]).toBe(1);
    expect(ds[1][7]).toBe(0);
  });
  it('a single full colour renders a full circle without NaN', () => {
    const svg = renderPieChart([0, 0, 100, 0, 0, 0], six);
    const paths = svg.querySelectorAll('path');
    expect(paths).toHaveLength(1);
    expect((paths[0].getAttribute('d')!.match(/A/g) ?? []).length).toBe(2);
    expect(svg.textContent).toContain('100%');
    noNaN(svg);
  });
  it('all-zero input has no wedges and no NaN; 12 colours give 12 wedges', () => {
    const svg = renderPieChart(new Array(6).fill(0), six);
    expect(svg.querySelectorAll('path')).toHaveLength(0);
    expect(svg.querySelector('circle')).not.toBeNull();
    noNaN(svg);
    expect(renderPieChart(new Array(12).fill(8), twelve).querySelectorAll('path')).toHaveLength(12);
  });
});

describe('renderPolarChart', () => {
  // A curve with one peak per 6-colour block, at its centre.
  const curve = Array.from({ length: 240 }, (_, i) => (i % 40 === 20 ? -10 : -50));
  const rings = [
    { id: 'outer', label: '外側:文の読み上げ', curveDb: curve },
    { id: 'inner', label: '内側:「あー」', curveDb: curve.map((v) => v - 20) },
  ];
  const radius = (pt: string) => {
    const [x, y] = pt.split(',').map(Number);
    return Math.hypot(x - 200, y - 200);
  };
  const angle = (pt: string) => {
    const [x, y] = pt.split(',').map(Number);
    return (Math.atan2(y - 200, x - 200) * 180) / Math.PI;
  };

  it('has a 400x400 viewBox, role img and an aria-label with the numbers HIGH to LOW', () => {
    const svg = renderPolarChart(rings, SHARES6, six);
    expect(svg.getAttribute('viewBox')).toBe('0 0 400 400');
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('6色の割合:紫30、青13、緑18、黄7、橙10、赤22');
    expect(findBannedWords(svg.getAttribute('aria-label')!)).toEqual([]);
    noNaN(svg);
  });
  it('draws one polyline per sector per ring in the sector colours', () => {
    const svg = renderPolarChart(rings, SHARES6, six);
    const groups = svg.querySelectorAll('g.ring');
    expect(groups).toHaveLength(2);
    for (const g of Array.from(groups)) {
      const lines = Array.from(g.querySelectorAll('polyline'));
      expect(lines).toHaveLength(6);
      expect(lines.map((l) => l.getAttribute('stroke'))).toEqual(COLORS_6.map((c) => c.css));
    }
    expect(svg.querySelector('g.ring-inner title')!.textContent).toBe('内側:「あー」');
  });
  it('maps level to radius between rBase and rMax using the ring\'s own peak', () => {
    const svg = renderPolarChart(rings, SHARES6, six);
    for (const id of ['outer', 'inner'] as const) {
      const pts = Array.from(svg.querySelectorAll(`g.ring-${id} polyline`))
        .flatMap((l) => l.getAttribute('points')!.split(' '));
      const rs = pts.map(radius);
      const { rBase, rMax } = RING_GEOMETRY[id];
      expect(Math.max(...rs)).toBeCloseTo(rMax, 0);
      // -50 is 40 dB below the -10 peak: level (60-40)/60 = 1/3
      expect(Math.min(...rs)).toBeCloseTo(rBase + (rMax - rBase) / 3, 0);
    }
  });
  it('the highest-frequency sector (violet) starts at the top-left and runs clockwise', () => {
    const svg = renderPolarChart([rings[0]], SHARES6, six);
    const violet = svg.querySelectorAll('g.ring-outer polyline')[5].getAttribute('points')!.split(' ');
    // points run LOW to HIGH frequency, i.e. counter-clockwise: the last point is next to the start angle
    expect(angle(violet[violet.length - 1])).toBeCloseTo(POLAR_START_DEG + 0.75, 0);
    expect(angle(violet[0])).toBeCloseTo(POLAR_START_DEG + 60 - 0.75, 0);
    const red = svg.querySelectorAll('g.ring-outer polyline')[0].getAttribute('points')!.split(' ');
    expect(angle(red[0])).toBeCloseTo(POLAR_START_DEG + 360 - 0.75 - 360, 0);
  });
  it('keeps even a 3-digit number inside the viewBox', () => {
    const t = Array.from(renderPolarChart(rings, [0, 0, 0, 100, 0, 0], six).querySelectorAll('text.share-number'))[3];
    expect(Number(t.getAttribute('x')) + 0.3 * 26 * 3).toBeLessThan(400);
  });
  it('places the numbers outside each sector, inside the viewBox, in the colour\'s own colour', () => {
    for (const [shares, opts, size] of [[SHARES6, six, 26], [new Array(12).fill(0).map((_, i) => 100 - i), twelve, 17]] as const) {
      const svg = renderPolarChart(rings, shares as number[], opts);
      const texts = Array.from(svg.querySelectorAll('text.share-number'));
      expect(texts).toHaveLength(opts.colors.length);
      texts.forEach((t, k) => {
        expect(t.textContent).toBe(String(shares[k]));
        expect(t.getAttribute('fill')).toBe(opts.colors[k].css);
        expect(Number(t.getAttribute('font-size'))).toBe(size);
        const x = Number(t.getAttribute('x'));
        const y = Number(t.getAttribute('y'));
        expect(Math.hypot(x - 200, y - 200)).toBeGreaterThan(RING_GEOMETRY.outer.rMax);
        const half = 0.3 * size * t.textContent!.length; // serif digits are about 0.6 em wide
        expect(x - half).toBeGreaterThan(0); expect(x + half).toBeLessThan(400);
        expect(y - size).toBeGreaterThan(0); expect(y).toBeLessThan(400);
      });
    }
  });
  it('12 colours re-colour the same 240 points into 12 sectors', () => {
    const svg = renderPolarChart(rings, new Array(12).fill(8), twelve);
    const lines = svg.querySelectorAll('g.ring-outer polyline');
    expect(lines).toHaveLength(12);
    expect(svg.querySelectorAll('line.divider')).toHaveLength(12);
    expect(svg.getAttribute('aria-label')).toMatch(/^12色の割合:/);
  });
  it('draws only the rings it is given; stars are deterministic', () => {
    const a = renderPolarChart([rings[0]], SHARES6, six);
    expect(a.querySelectorAll('g.ring')).toHaveLength(1);
    expect(renderPolarChart([], SHARES6, six).querySelectorAll('g.ring')).toHaveLength(0);
    const stars = (el: SVGSVGElement) => el.querySelector('g.stars')!.innerHTML;
    expect(stars(a)).toBe(stars(renderPolarChart(rings, [0, 0, 0, 0, 0, 0], six)));
  });
  it('a silent curve sits on the base circle without NaN', () => {
    const svg = renderPolarChart([{ id: 'outer', label: 'x', curveDb: new Array(240).fill(-120) }], new Array(6).fill(0), six);
    const rs = Array.from(svg.querySelectorAll('polyline')).flatMap((l) => l.getAttribute('points')!.split(' ')).map(radius);
    for (const r of rs) expect(r).toBeCloseTo(RING_GEOMETRY.outer.rBase, 0);
    noNaN(svg);
  });
});
