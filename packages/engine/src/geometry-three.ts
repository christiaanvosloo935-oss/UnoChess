import type { Army, PieceType, Square } from './types.js';
import type { CastleSide, Geometry } from './geometry.js';

/**
 * The 96-square three-player board. Square index is `section*32 + rank*8 + file`, with
 * section 0/1/2 = w/r/b and file/rank in that section's own frame (rank 3 is next to the
 * centre). All coordinate maths for this board lives in this file; the tables are built
 * once at module load by a "walker" that tracks a position and a heading, and turns the
 * heading round when it crosses a seam (after crossing, forward is decreasing rank).
 */

const ARMIES: readonly Army[] = ['w', 'r', 'b'];
const SIZE = 96;

interface Pos {
  s: number;
  f: number;
  r: number;
}
type Dir = [number, number]; // [df, dr] in the frame of the section the walker is in
interface Walk {
  p: Pos;
  d: Dir;
}

const idx = ({ s, f, r }: Pos): Square => s * 32 + r * 8 + f;
const pos = (sq: Square): Pos => ({ s: sq >> 5, f: sq & 7, r: (sq >> 3) & 3 });
const sectionOf = (army: Army) => ARMIES.indexOf(army);

/** G1: the section across the seam from file `f` of section `s`. */
const across = (s: number, f: number) => (f <= 3 ? (s + 1) % 3 : (s + 2) % 3);

/** G1/G2: one orthogonal step. Ranks never wrap; leaving rank 3 forward crosses a seam. */
function orthStep({ s, f, r }: Pos, [df, dr]: Dir): Walk | null {
  if (df !== 0) {
    const nf = f + df;
    return nf < 0 || nf > 7 ? null : { p: { s, f: nf, r }, d: [df, 0] };
  }
  const nr = r + dr;
  if (nr < 0) return null;
  if (nr <= 3) return { p: { s, f, r: nr }, d: [0, dr] };
  return { p: { s: across(s, f), f: 7 - f, r: 3 }, d: [0, -1] };
}

/** G3: the six centre squares in ring order w.d4, w.e4, b.d4, b.e4, r.d4, r.e4. */
const RING: Pos[] = [
  { s: 0, f: 3, r: 3 },
  { s: 0, f: 4, r: 3 },
  { s: 2, f: 3, r: 3 },
  { s: 2, f: 4, r: 3 },
  { s: 1, f: 3, r: 3 },
  { s: 1, f: 4, r: 3 },
];

/** G4: one diagonal step; it may branch into three at the centre. */
function diagStep({ s, f, r }: Pos, [df, dr]: Dir): Walk[] {
  const nf = f + df;
  const nr = r + dr;
  if (nf < 0 || nf > 7 || nr < 0) return [];
  if (nr <= 3) return [{ p: { s, f: nf, r: nr }, d: [df, dr] }];
  if (f <= 3 === nf <= 3) return [{ p: { s: across(s, f), f: 7 - nf, r: 3 }, d: [-df, -1] }];
  const i = RING.findIndex((q) => q.s === s && q.f === f);
  return [2, 3, 4].map((o) => {
    const p = RING[(i + o) % 6];
    return { p, d: [p.f === 3 ? -1 : 1, -1] };
  });
}

const ORTH: Dir[] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAG: Dir[] = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ALL: Square[] = Array.from({ length: SIZE }, (_, i) => i);

function orthRaysFrom(sq: Square): Square[][] {
  const out: Square[][] = [];
  for (const d of ORTH) {
    const ray: Square[] = [];
    let w = orthStep(pos(sq), d);
    while (w) {
      ray.push(idx(w.p));
      w = orthStep(w.p, w.d);
    }
    if (ray.length) out.push(ray);
  }
  return out;
}

function diagRaysFrom(sq: Square): Square[][] {
  const out: Square[][] = [];
  const go = (p: Pos, d: Dir, acc: Square[]) => {
    const next = diagStep(p, d);
    if (next.length === 0) {
      if (acc.length) out.push(acc);
      return;
    }
    for (const w of next) go(w.p, w.d, [...acc, idx(w.p)]);
  };
  for (const d of DIAG) go(pos(sq), d, []);
  return out;
}

/** G5: walk two orthogonally, then one to either side; then take the symmetric closure. */
function knightWalks(sq: Square): Square[] {
  const out: Square[] = [];
  for (const d of ORTH) {
    const one = orthStep(pos(sq), d);
    const two = one && orthStep(one.p, one.d);
    if (!two) continue;
    const sides: Dir[] = two.d[0] !== 0 ? [[0, 1], [0, -1]] : [[1, 0], [-1, 0]];
    for (const side of sides) {
      const w = orthStep(two.p, side);
      if (w) out.push(idx(w.p));
    }
  }
  return out;
}

const uniq = (a: Square[]) => [...new Set(a)];

const orthRays = ALL.map(orthRaysFrom);
const diagRays = ALL.map(diagRaysFrom);

const knightJumps: Square[][] = ALL.map(() => []);
for (const a of ALL) {
  for (const b of knightWalks(a)) {
    knightJumps[a].push(b);
    knightJumps[b].push(a);
  }
}
for (const a of ALL) knightJumps[a] = uniq(knightJumps[a]);

/** G6: orthogonal neighbours plus the first square of each diagonal ray. */
const kingSteps = ALL.map((sq) => uniq([...orthRays[sq], ...diagRays[sq]].map((ray) => ray[0])));

/** G7: forward is up in the army's own section and down everywhere else. */
const forwardDr = (army: Army, sq: Square) => ((sq >> 5) === sectionOf(army) ? 1 : -1);

function pawnPush(army: Army, sq: Square): Square | null {
  const w = orthStep(pos(sq), [0, forwardDr(army, sq)]);
  return w ? idx(w.p) : null;
}

function pawnCaptures(army: Army, sq: Square): Square[] {
  const dr = forwardDr(army, sq);
  return uniq([-1, 1].flatMap((df) => diagStep(pos(sq), [df, dr]).map((w) => idx(w.p))));
}

const pawnAttackers: Record<Army, Square[][]> = { w: [], r: [], b: [] };
for (const army of ARMIES) {
  pawnAttackers[army] = ALL.map(() => []);
  for (const s of ALL) for (const t of pawnCaptures(army, s)) pawnAttackers[army][t].push(s);
}

/** G8: castling as classic, inside the army's own section. */
function castleSide(army: Army, side: 'k' | 'q'): CastleSide {
  const h = sectionOf(army) * 32;
  return side === 'k'
    ? { kingTo: h + 6, rookFrom: h + 7, rookTo: h + 5, empty: [h + 5, h + 6], safe: [h + 5, h + 6] }
    : { kingTo: h + 2, rookFrom: h, rookTo: h + 3, empty: [h + 1, h + 2, h + 3], safe: [h + 2, h + 3] };
}

const BACK: PieceType[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];

export const threeGeometry: Geometry = {
  variant: 'three',
  armies: ARMIES,
  size: SIZE,
  orthRays,
  diagRays,
  knightJumps,
  kingSteps,
  pawnPush,
  pawnDouble(army, sq) {
    const { s, f, r } = pos(sq);
    return s === sectionOf(army) && r === 1 ? idx({ s, f, r: 3 }) : null;
  },
  pawnCaptures,
  pawnAttackersOf: (army, target) => [...pawnAttackers[army][target]],
  isPromotionSquare: (army, sq) => (sq >> 5) !== sectionOf(army) && pos(sq).r === 0,
  reviveSquares: (army) => Array.from({ length: 16 }, (_, i) => sectionOf(army) * 32 + i),
  startPieces() {
    const out: { sq: Square; army: Army; type: PieceType }[] = [];
    for (const army of ARMIES) {
      const s = sectionOf(army);
      for (let f = 0; f < 8; f++) {
        out.push({ sq: idx({ s, f, r: 0 }), army, type: BACK[f] });
        out.push({ sq: idx({ s, f, r: 1 }), army, type: 'p' });
      }
    }
    return out;
  },
  castling: (army) => ({ kingFrom: sectionOf(army) * 32 + 4, k: castleSide(army, 'k'), q: castleSide(army, 'q') }),
  isDark: (sq) => (pos(sq).f + pos(sq).r) % 2 === 0,
};
