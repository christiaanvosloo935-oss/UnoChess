import { describe, it, expect } from 'vitest';
import { geometryFor, type Army } from '@isachess/engine';
import { layoutHex } from '../src/hexLayout';

const ARMIES: Army[] = ['w', 'r', 'b'];
const geo = geometryFor('three');
const dist = (a: { cx: number; cy: number }, b: { cx: number; cy: number }) => Math.hypot(a.cx - b.cx, a.cy - b.cy);
const cellWidth = (poly: [number, number][]) => {
  const xs = poly.map((p) => p[0]);
  return Math.max(...xs) - Math.min(...xs);
};

describe('layoutHex', () => {
  it('returns 96 cells with distinct centres', () => {
    for (const army of ARMIES) {
      const { cells, width, height } = layoutHex(army);
      expect(cells).toHaveLength(96);
      expect(new Set(cells.map((c) => c.sq)).size).toBe(96);
      expect(new Set(cells.map((c) => `${c.cx.toFixed(2)},${c.cy.toFixed(2)}`)).size).toBe(96);
      for (const c of cells) {
        expect(c.cx).toBeGreaterThan(0);
        expect(c.cx).toBeLessThan(width);
        expect(c.cy).toBeGreaterThan(0);
        expect(c.cy).toBeLessThan(height);
      }
    }
  });

  it('adjacent squares are drawn close', () => {
    for (const army of ARMIES) {
      const { cells } = layoutHex(army);
      const bySq = new Map(cells.map((c) => [c.sq, c]));
      const widths = cells.map((c) => cellWidth(c.polygon)).sort((a, b) => a - b);
      const median = widths[widths.length >> 1];
      let pairs = 0;
      for (const sq of bySq.keys()) {
        for (const ray of geo.orthRays[sq]) {
          const n = ray[0];
          expect(dist(bySq.get(sq)!, bySq.get(n)!)).toBeLessThan(1.5 * median);
          pairs++;
        }
      }
      expect(pairs).toBeGreaterThan(300);
    }
  });

  it('rosette squares all touch the centre', () => {
    for (const army of ARMIES) {
      const { cells } = layoutHex(army);
      const bySq = new Map(cells.map((c) => [c.sq, c]));
      const rosette = [0, 1, 2].flatMap((s) => [s * 32 + 3 * 8 + 3, s * 32 + 3 * 8 + 4]);
      const corners = rosette.map((sq) => bySq.get(sq)!.polygon);
      const found = corners[0].some((p) =>
        corners.every((poly) => poly.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.01)),
      );
      expect(found).toBe(true);
    }
  });

  it("the viewer's back rank is lowest on screen", () => {
    for (const army of ARMIES) {
      const { cells } = layoutHex(army);
      const s = ARMIES.indexOf(army);
      const meanY = (rank: number) => {
        const ys = cells.filter((c) => c.sq >= s * 32 && c.sq < s * 32 + 32 && ((c.sq % 32) >> 3) === rank).map((c) => c.cy);
        return ys.reduce((a, b) => a + b, 0) / ys.length;
      };
      const back = meanY(0);
      for (const r of [1, 2, 3]) expect(back).toBeGreaterThan(meanY(r));
    }
  });
});
