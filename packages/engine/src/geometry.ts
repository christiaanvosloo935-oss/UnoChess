import type { Army, PieceType, Square } from './types.js';
import { classicGeometry } from './geometry-classic.js';

export type Variant = 'classic' | 'three';

export interface CastleSide {
  kingTo: Square;
  rookFrom: Square;
  rookTo: Square;
  empty: Square[];
  safe: Square[];
}

export interface Geometry {
  variant: Variant;
  armies: readonly Army[];
  size: number;
  orthRays: Square[][][];
  diagRays: Square[][][];
  knightJumps: Square[][];
  kingSteps: Square[][];
  pawnPush(army: Army, sq: Square): Square | null;
  pawnDouble(army: Army, sq: Square): Square | null;
  pawnCaptures(army: Army, sq: Square): Square[];
  pawnAttackersOf(army: Army, target: Square): Square[];
  isPromotionSquare(army: Army, sq: Square): boolean;
  reviveSquares(army: Army): Square[];
  startPieces(): { sq: Square; army: Army; type: PieceType }[];
  castling(army: Army): { kingFrom: Square; k: CastleSide; q: CastleSide } | null;
  isDark(sq: Square): boolean;
}

export function geometryFor(variant: Variant): Geometry {
  if (variant === 'classic') return classicGeometry;
  throw new Error('three-player geometry not implemented');
}

/** The armies that can attack `army`'s king. */
export function enemiesOf(variant: Variant, army: Army): Army[] {
  return geometryFor(variant).armies.filter((a) => a !== army);
}
