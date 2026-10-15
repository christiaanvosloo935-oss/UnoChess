import { describe, expect, it } from 'vitest';
import { geometryFor } from '../src/geometry.js';
import type { Army } from '../src/types.js';
import { hsq } from './helpers.js';

const g = geometryFor('three');
const set = (a: number[]) => [...new Set(a)].sort((x, y) => x - y);
const w = (n: string) => hsq('w', n);
const r = (n: string) => hsq('r', n);
const b = (n: string) => hsq('b', n);
const ARMIES: Army[] = ['w', 'r', 'b'];
const ALL = Array.from({ length: 96 }, (_, i) => i);
const orthNeighbours = (s: number) => set(g.orthRays[s].map((ray) => ray[0]));

describe('three-player geometry', () => {
  it('has 96 squares, 3 sections of 32, and 48 start pieces with each king on e1 of its section', () => {
    expect(g.variant).toBe('three');
    expect(g.armies).toEqual(['w', 'r', 'b']);
    expect(g.size).toBe(96);
    for (const t of [g.orthRays, g.diagRays, g.knightJumps, g.kingSteps]) expect(t.length).toBe(96);
    const start = g.startPieces();
    expect(start.length).toBe(48);
    expect(new Set(start.map((p) => p.sq)).size).toBe(48);
    for (const a of ARMIES) {
      const mine = start.filter((p) => p.army === a);
      expect(mine.length).toBe(16);
      expect(mine.every((p) => Math.floor(p.sq / 32) === 'wrb'.indexOf(a))).toBe(true);
      expect(mine.filter((p) => p.type === 'k').map((p) => p.sq)).toEqual([hsq(a, 'e1')]);
      expect(mine.filter((p) => p.type === 'q').map((p) => p.sq)).toEqual([hsq(a, 'd1')]);
      expect(set(mine.filter((p) => p.type === 'p').map((p) => p.sq))).toEqual(
        set('abcdefgh'.split('').map((f) => hsq(a, `${f}2`))),
      );
    }
  });

  it('forward file rays cross the seam', () => {
    expect(g.orthRays[w('a1')]).toContainEqual([w('a2'), w('a3'), w('a4'), r('h4'), r('h3'), r('h2'), r('h1')]);
    expect(g.orthRays[w('f4')]).toContainEqual([b('c4'), b('c3'), b('c2'), b('c1')]);
  });

  it('ranks do not wrap', () => {
    const rankRays = g.orthRays[w('a1')].filter((ray) => ray.every((s) => s >= w('a1') && s <= w('h1')));
    expect(rankRays).toEqual([[w('b1'), w('c1'), w('d1'), w('e1'), w('f1'), w('g1'), w('h1')]]);
    expect(g.orthRays[w('a1')].length).toBe(2);
  });

  it('rosette is a ring of six', () => {
    expect(orthNeighbours(w('d4'))).toEqual(set([w('c4'), w('e4'), w('d3'), r('e4')]));
    expect(orthNeighbours(w('e4'))).toEqual(set([w('d4'), w('f4'), w('e3'), b('d4')]));
    expect(orthNeighbours(b('e4'))).toEqual(set([b('d4'), b('f4'), b('e3'), r('d4')]));
  });

  it('diagonal crosses a seam', () => {
    const prefix = [w('c4'), r('e4'), r('d3'), r('c2'), r('b1')];
    expect(g.diagRays[w('b3')].some((ray) => prefix.every((s, i) => ray[i] === s))).toBe(true);
  });

  it('diagonals branch three ways at the centre', () => {
    const head = [w('b2'), w('c3'), w('d4')];
    expect(g.diagRays[w('a1')]).toEqual([
      [...head, b('d4'), b('c3'), b('b2'), b('a1')],
      [...head, b('e4'), b('f3'), b('g2'), b('h1')],
      [...head, r('d4'), r('c3'), r('b2'), r('a1')],
    ]);
  });

  it('knights', () => {
    expect(set(g.knightJumps[w('e2')])).toEqual(set([w('d4'), w('f4'), w('c3'), w('g3'), w('c1'), w('g1')]));
    expect(set(g.knightJumps[w('c4')])).toEqual(
      set([r('e3'), r('g3'), r('h4'), b('d4'), r('d4'), w('a3'), w('e3'), w('b2'), w('d2')]),
    );
    expect(g.knightJumps[w('c4')].length).toBe(9);
  });

  it('kings', () => {
    expect(g.kingSteps[w('d4')].length).toBe(10);
    expect(g.kingSteps[w('a1')].length).toBe(3);
  });

  it('symmetry', () => {
    const reach = (rays: number[][][]) => rays.map((rs) => new Set(rs.flat()));
    const tables: Set<number>[][] = [
      g.kingSteps.map((l) => new Set(l)),
      g.knightJumps.map((l) => new Set(l)),
      reach(g.orthRays),
      reach(g.diagRays),
    ];
    for (const t of tables) {
      for (const a of ALL) {
        expect(t[a].has(a)).toBe(false);
        for (const s of t[a]) expect(t[s].has(a), `${a} -> ${s}`).toBe(true);
      }
    }
  });

  it('pawns', () => {
    expect(g.pawnPush('w', w('c4'))).toBe(r('f4'));
    expect(g.pawnPush('w', r('f4'))).toBe(r('f3'));
    expect(g.pawnPush('r', w('c4'))).toBe(w('c3'));
    expect(g.pawnDouble('w', w('c2'))).toBe(w('c4'));
    expect(g.pawnDouble('w', w('c3'))).toBeNull();
    expect(g.pawnDouble('w', r('c2'))).toBeNull();
    expect(set(g.pawnCaptures('w', w('b2')))).toEqual(set([w('a3'), w('c3')]));
    expect(set(g.pawnCaptures('w', w('d4')))).toEqual(set([r('f4'), b('d4'), b('e4'), r('d4')]));
    for (const a of ARMIES) {
      for (const t of ALL) {
        expect(set(g.pawnAttackersOf(a, t))).toEqual(ALL.filter((s) => g.pawnCaptures(a, s).includes(t)));
      }
    }
  });

  it('promotion, revive, castling, colours', () => {
    expect(g.isPromotionSquare('w', r('a1'))).toBe(true);
    expect(g.isPromotionSquare('w', b('h1'))).toBe(true);
    expect(g.isPromotionSquare('w', w('a1'))).toBe(false);
    expect(g.isPromotionSquare('r', r('a1'))).toBe(false);
    expect(set(g.reviveSquares('w'))).toEqual(Array.from({ length: 16 }, (_, i) => i));
    expect(g.castling('r')?.k).toEqual({
      kingTo: r('g1'),
      rookFrom: r('h1'),
      rookTo: r('f1'),
      empty: [r('f1'), r('g1')],
      safe: [r('f1'), r('g1')],
    });
    for (const a of ALL) for (const s of orthNeighbours(a)) expect(g.isDark(a)).not.toBe(g.isDark(s));
  });
});
