import { describe, it, expect } from 'vitest';
import { renderBarChart, renderPieChart } from '../../src/ui/charts';
import { BAND_COLORS } from '../../src/diagnosis/config';

const share = Array.from({ length: 12 }, (_, i) => i + 1).map((v, _i, a) => v / a.reduce((x, y) => x + y, 0));

function allAttrs(root: Element): string[] {
  const out: string[] = [];
  for (const el of [root, ...Array.from(root.querySelectorAll('*'))]) {
    for (const a of Array.from(el.attributes)) out.push(a.value);
    out.push(el.textContent ?? '');
  }
  return out;
}

describe('renderBarChart', () => {
  it('draws 12 rects with band colors and the largest scaled to 60', () => {
    const svg = renderBarChart(share);
    const rects = Array.from(svg.querySelectorAll('rect.bar'));
    expect(rects).toHaveLength(12);
    expect(rects.map((r) => r.getAttribute('fill'))).toEqual(BAND_COLORS);
    const hs = rects.map((r) => Number(r.getAttribute('height')));
    expect(hs.every(Number.isFinite)).toBe(true);
    expect(hs.indexOf(Math.max(...hs))).toBe(11);
    expect(hs[0]).toBeLessThan(hs[11]);
    expect(hs[11]).toBeGreaterThan(0);
    // axis 0-60: bar for max equals the full plot height (the 60 tick's distance from 0 tick)
    const y0 = Number(svg.querySelector('[data-tick="0"]')!.getAttribute('y1'));
    const y60 = Number(svg.querySelector('[data-tick="60"]')!.getAttribute('y1'));
    expect(hs[11]).toBeCloseTo(y0 - y60, 6);
    for (const t of ['0', '20', '40', '60']) expect(svg.querySelector(`[data-tick="${t}"]`)).not.toBeNull();
    expect(svg.getAttribute('role')).toBe('img');
  });
  it('all-zero input gives zero-height bars and no NaN', () => {
    const svg = renderBarChart(new Array(12).fill(0));
    const hs = Array.from(svg.querySelectorAll('rect.bar')).map((r) => Number(r.getAttribute('height')));
    expect(hs).toEqual(new Array(12).fill(0));
    expect(allAttrs(svg).some((v) => v.includes('NaN'))).toBe(false);
  });
});

describe('renderPieChart', () => {
  it('draws 12 wedges for 12 positive shares, with colors and labels', () => {
    const svg = renderPieChart(share);
    const paths = Array.from(svg.querySelectorAll('path'));
    expect(paths).toHaveLength(12);
    expect(paths.map((p) => p.getAttribute('fill'))).toEqual(BAND_COLORS);
    expect(paths.every((p) => !p.getAttribute('d')!.includes('NaN'))).toBe(true);
    expect(svg.textContent).toContain('15%');
    expect(svg.getAttribute('role')).toBe('img');
  });
  it('a single full band renders a full circle without NaN', () => {
    const s = new Array(12).fill(0);
    s[4] = 1;
    const svg = renderPieChart(s);
    const paths = svg.querySelectorAll('path');
    expect(paths).toHaveLength(1);
    const d = paths[0].getAttribute('d')!;
    expect((d.match(/A/g) ?? []).length).toBe(2);
    expect(allAttrs(svg).some((v) => v.includes('NaN'))).toBe(false);
    expect(svg.textContent).toContain('100%');
  });
  it('all-zero input has no wedges and no NaN', () => {
    const svg = renderPieChart(new Array(12).fill(0));
    expect(svg.querySelectorAll('path')).toHaveLength(0);
    expect(svg.querySelector('circle')).not.toBeNull();
    expect(allAttrs(svg).some((v) => v.includes('NaN'))).toBe(false);
  });
});

describe('pie geometry', () => {
  const nums = (d: string) => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  it('four quarters start at 12 o\'clock, run clockwise, large-arc 0', () => {
    const svg = renderPieChart([0.25, 0.25, 0.25, 0.25, 0, 0, 0, 0, 0, 0, 0, 0]);
    const ds = Array.from(svg.querySelectorAll('path')).map((p) => p.getAttribute('d')!);
    expect(ds).toHaveLength(4);
    const ends = ds.map((d) => nums(d));
    // M c c L x1 y1 A r r rot large sweep x2 y2
    expect(ends[0].slice(0, 2)).toEqual([100, 100]);
    expect(ends[0][2]).toBeCloseTo(100); expect(ends[0][3]).toBeCloseTo(10); // starts at top
    expect(ends[0][9]).toBeCloseTo(190); expect(ends[0][10]).toBeCloseTo(100); // quarter ends at 3 o'clock
    expect(ends[1][9]).toBeCloseTo(100); expect(ends[1][10]).toBeCloseTo(190);
    for (const e of ends) { expect(e[7]).toBe(0); expect(e[8]).toBe(1); }
  });
  it('normalizes by the sum', () => {
    const d = (v: number) => Array.from(renderPieChart(new Array(12).fill(v)).querySelectorAll('path')).map((p) => p.getAttribute('d'));
    expect(d(2)).toEqual(d(1));
  });
  it('a share over one half uses the large arc', () => {
    const s = new Array(12).fill(0); s[0] = 0.7; s[1] = 0.3;
    const ds = Array.from(renderPieChart(s).querySelectorAll('path')).map((p) => nums(p.getAttribute('d')!));
    expect(ds[0][7]).toBe(1);
    expect(ds[1][7]).toBe(0);
  });
  it('tiny slices read 1%未満 in titles', () => {
    const s = new Array(12).fill(0); s[0] = 0.001; s[1] = 0.999;
    expect(renderPieChart(s).querySelector('path title')!.textContent).toContain('1%未満');
  });
});
