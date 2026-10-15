import type { Army, PieceType, Square } from './types.js';
import type { CastleSide, Geometry } from './geometry.js';

const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KING = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const inBoard = (f: number, r: number) => f >= 0 && f < 8 && r >= 0 && r < 8;
const idx = (f: number, r: number) => r * 8 + f;
const forward = (army: Army) => (army === 'w' ? 1 : -1);

function rays(dirs: number[][]): Square[][][] {
  return Array.from({ length: 64 }, (_, sq) => {
    const out: Square[][] = [];
    for (const [df, dr] of dirs) {
      const ray: Square[] = [];
      let f = (sq & 7) + df;
      let r = (sq >> 3) + dr;
      while (inBoard(f, r)) {
        ray.push(idx(f, r));
        f += df;
        r += dr;
      }
      if (ray.length) out.push(ray);
    }
    return out;
  });
}

function jumps(deltas: number[][]): Square[][] {
  return Array.from({ length: 64 }, (_, sq) =>
    deltas.flatMap(([df, dr]) => {
      const f = (sq & 7) + df;
      const r = (sq >> 3) + dr;
      return inBoard(f, r) ? [idx(f, r)] : [];
    }),
  );
}

const homeRank = (army: Army) => (army === 'w' ? 0 : 7);

function castleSide(army: Army, side: 'k' | 'q'): CastleSide {
  const h = homeRank(army) * 8;
  return side === 'k'
    ? { kingTo: h + 6, rookFrom: h + 7, rookTo: h + 5, empty: [h + 5, h + 6], safe: [h + 5, h + 6] }
    : { kingTo: h + 2, rookFrom: h, rookTo: h + 3, empty: [h + 1, h + 2, h + 3], safe: [h + 2, h + 3] };
}

const BACK: PieceType[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];

export const classicGeometry: Geometry = {
  variant: 'classic',
  armies: ['w', 'b'],
  size: 64,
  orthRays: rays(ORTH),
  diagRays: rays(DIAG),
  knightJumps: jumps(KNIGHT),
  kingSteps: jumps(KING),
  pawnPush(army, sq) {
    const r = (sq >> 3) + forward(army);
    return inBoard(sq & 7, r) ? idx(sq & 7, r) : null;
  },
  pawnDouble(army, sq) {
    return (sq >> 3) === (army === 'w' ? 1 : 6) ? idx(sq & 7, (sq >> 3) + 2 * forward(army)) : null;
  },
  pawnCaptures(army, sq) {
    const r = (sq >> 3) + forward(army);
    return [-1, 1].flatMap((df) => (inBoard((sq & 7) + df, r) ? [idx((sq & 7) + df, r)] : []));
  },
  pawnAttackersOf(army, target) {
    const r = (target >> 3) - forward(army);
    return [-1, 1].flatMap((df) => (inBoard((target & 7) + df, r) ? [idx((target & 7) + df, r)] : []));
  },
  isPromotionSquare: (army, sq) => (sq >> 3) === (army === 'w' ? 7 : 0),
  reviveSquares: (army) => Array.from({ length: 16 }, (_, i) => (army === 'w' ? 0 : 48) + i),
  startPieces() {
    const out: { sq: Square; army: Army; type: PieceType }[] = [];
    for (const army of ['w', 'b'] as const) {
      for (let f = 0; f < 8; f++) {
        out.push({ sq: idx(f, homeRank(army)), army, type: BACK[f] });
        out.push({ sq: idx(f, army === 'w' ? 1 : 6), army, type: 'p' });
      }
    }
    return out;
  },
  castling: (army) =>
    army === 'r' ? null : { kingFrom: homeRank(army) * 8 + 4, k: castleSide(army, 'k'), q: castleSide(army, 'q') },
  isDark: (sq) => ((sq & 7) + (sq >> 3)) % 2 === 0,
};
