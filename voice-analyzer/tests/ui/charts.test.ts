import { describe, it, expect } from 'vitest';
import {
  renderBarChart, renderPieChart, renderPolarChart, POLAR_START_DEG, RING_GEOMETRY,
} from '../../src/ui/charts';
import { COLORS_6, COLORS_12, lightenForDark } from '../../src/diagnosis/colors';
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
  it('12 colours give 12 wide bars labelled with one-character names at >= 16 units', () => {
    const svg = renderBarChart(new Array(12).fill(0).map((_, i) => i + 1), twelve);
    const rects = Array.from(svg.querySelectorAll('rect.bar'));
    expect(rects).toHaveLength(12);
    const names = Array.from(svg.querySelectorAll('.bar-name')).map((t) => t.textContent!);
    expect(names).toEqual(COLORS_12.map((c) => c.shortName));
    expect(names.every((x) => x.length === 1)).toBe(true);
    for (const t of Array.from(svg.querySelectorAll('.bar-name, .bar-value'))) {
      expect(Number(t.getAttribute('font-size'))).toBeGreaterThanOrEqual(16);
    }
    const span = Number(rects[11].getAttribute('x')) + Number(rects[11].getAttribute('width')) - Number(rects[0].getAttribute('x'));
    expect(span).toBeGreaterThan(340);
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
  it('12 colours label only wedges of at least 4%', () => {
    const svg = renderPieChart([3, 3, 4, 10, 10, 10, 10, 10, 10, 10, 10, 10], twelve);
    expect(svg.querySelectorAll('path')).toHaveLength(12);
    expect(svg.querySelectorAll('.pie-label')).toHaveLength(10);
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
  it('a lone 100 (in any sector) stays clear of the outer ring and of the viewBox edge', () => {
    for (let k = 0; k < 6; k++) {
      const shares = [0, 0, 0, 0, 0, 0];
      shares[k] = 100;
      const t = Array.from(renderPolarChart(rings, shares, six).querySelectorAll('text.share-number'))[k];
      expect(t.textContent).toBe('100');
      const size = Number(t.getAttribute('font-size'));
      expect(size).toBeLessThan(26);
      const x = Number(t.getAttribute('x'));
      const y = Number(t.getAttribute('y'));
      const half = 0.3 * size * 3;
      const [x0, x1, y0, y1] = [x - half, x + half, y - 0.75 * size, y];
      expect(x0).toBeGreaterThan(2); expect(x1).toBeLessThan(398);
      expect(y0).toBeGreaterThan(2); expect(y1).toBeLessThan(398);
      // nearest point of the glyph box to the centre is outside the ring's maximum radius
      const nx = Math.min(Math.max(200, x0), x1);
      const ny = Math.min(Math.max(200, y0), y1);
      expect(Math.hypot(nx - 200, ny - 200), `sector ${k}`).toBeGreaterThan(RING_GEOMETRY.outer.rMax + 2);
    }
  });
  it('places bold numbers outside each sector, inside the viewBox, in a lightened tint of the colour', () => {
    for (const [shares, opts, size] of [[SHARES6, six, 26], [new Array(12).fill(0).map((_, i) => 20 - i), twelve, 18]] as const) {
      const svg = renderPolarChart(rings, shares as number[], opts);
      const texts = Array.from(svg.querySelectorAll('text.share-number'));
      expect(texts).toHaveLength(opts.colors.length);
      texts.forEach((t, k) => {
        expect(t.textContent).toBe(String(shares[k]));
        expect(t.getAttribute('fill')).toBe(lightenForDark(opts.colors[k].css));
        expect(t.getAttribute('font-weight')).toBe('700');
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
  it('with no usable curve it draws the guides and a short centred text instead of rings', () => {
    const svg = renderPolarChart([{ id: 'outer', label: 'x', curveDb: new Array(240).fill(-120) }], new Array(6).fill(0), six);
    expect(svg.querySelectorAll('polyline')).toHaveLength(0);
    expect(svg.querySelectorAll('circle.guide').length).toBeGreaterThan(0);
    expect(svg.querySelector('text.polar-empty')!.textContent).toBe('リングは表示できません');
    expect(findBannedWords(svg.textContent!)).toEqual([]);
    noNaN(svg);
    // no rings requested (both unchecked): no text either
    expect(renderPolarChart([], SHARES6, six).querySelector('text.polar-empty')).toBeNull();
  });
  it('sector polylines share their boundary point (no gap) and dark colours get thicker lines', () => {
    const svg = renderPolarChart([rings[0]], new Array(12).fill(8), twelve);
    const lines = Array.from(svg.querySelectorAll('g.ring-outer polyline'));
    for (let k = 0; k < 11; k++) {
      const a = lines[k].getAttribute('points')!.split(' ');
      expect(a[a.length - 1]).toBe(lines[k + 1].getAttribute('points')!.split(' ')[0]);
    }
    const width = (k: number) => Number(lines[k].getAttribute('stroke-width'));
    expect(width(9)).toBeGreaterThan(width(3)); // 藍 vs 黄
    expect(lines[9].classList.contains('ring-line-dim')).toBe(true);
  });
});
