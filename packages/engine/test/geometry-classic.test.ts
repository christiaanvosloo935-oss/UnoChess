import { describe, expect, it } from 'vitest';
import { geometryFor } from '../src/geometry.js';
import { sq } from './helpers.js';

const g = geometryFor('classic');
const set = (a: number[]) => [...a].sort((x, y) => x - y);

describe('classic geometry', () => {
  it('has 64 squares and 16 start pieces per side', () => {
    expect(g.size).toBe(64);
    expect(g.startPieces().length).toBe(32);
    expect(g.startPieces().filter((p) => p.army === 'w').length).toBe(16);
    expect(g.startPieces().filter((p) => p.army === 'b').length).toBe(16);
  });

  it('rook rays from a1', () => {
    const rays = g.orthRays[0];
    expect(rays.length).toBe(2);
    expect(rays.map((r) => r.length)).toEqual([7, 7]);
  });

  it('knight on e4 has 8 jumps and on a1 has 2', () => {
    expect(g.knightJumps[sq('e4')].length).toBe(8);
    expect(g.knightJumps[sq('a1')].length).toBe(2);
  });

  it('pawn paths', () => {
    expect(g.pawnPush('w', sq('e2'))).toBe(sq('e3'));
    expect(g.pawnDouble('w', sq('e2'))).toBe(sq('e4'));
    expect(g.pawnDouble('w', sq('e3'))).toBeNull();
    expect(set(g.pawnCaptures('b', sq('e7')))).toEqual(set([sq('d6'), sq('f6')]));
    expect(set(g.pawnAttackersOf('w', sq('e4')))).toEqual(set([sq('d3'), sq('f3')]));
  });

  it('promotion and revive', () => {
    expect(g.isPromotionSquare('w', sq('a8'))).toBe(true);
    expect(g.isPromotionSquare('w', sq('a7'))).toBe(false);
    expect(g.reviveSquares('w')).toEqual(Array.from({ length: 16 }, (_, i) => i));
  });

  it('castling', () => {
    expect(g.castling('w')).toEqual({
      kingFrom: sq('e1'),
      k: { kingTo: sq('g1'), rookFrom: sq('h1'), rookTo: sq('f1'), empty: [sq('f1'), sq('g1')], safe: [sq('f1'), sq('g1')] },
      q: { kingTo: sq('c1'), rookFrom: sq('a1'), rookTo: sq('d1'), empty: [sq('b1'), sq('c1'), sq('d1')], safe: [sq('c1'), sq('d1')] },
    });
    expect(g.castling('r')).toBeNull();
  });

  it('isDark', () => {
    expect(g.isDark(sq('a1'))).toBe(true);
    expect(g.isDark(sq('a2'))).toBe(false);
  });
});
