import type { Army, Effects, Piece, Square } from '@isachess/engine';

type Board = readonly (Piece | null)[];

export interface PieceMove {
  id: string;
  from: Square;
  to: Square;
  hop: boolean; // knight-shaped jump: lift over the pieces in between instead of sliding
}

export interface BoardDiff {
  moves: PieceMove[];
  captured: { piece: Piece; square: Square }[]; // square = where the piece stood
  appeared: { id: string; square: Square }[];
  promoted: { id: string; square: Square }[];
}

const isKnightJump = (a: Square, b: Square): boolean => {
  const dx = Math.abs((a & 7) - (b & 7));
  const dy = Math.abs((a >> 3) - (b >> 3));
  return (dx === 1 && dy === 2) || (dx === 2 && dy === 1);
};

const byId = (board: Board): Map<string, { piece: Piece; sq: Square }> => {
  const map = new Map<string, { piece: Piece; sq: Square }>();
  board.forEach((piece, sq) => {
    if (piece) map.set(piece.id, { piece, sq });
  });
  return map;
};

/** What changed between two boards, keyed by piece id, so the UI can animate each piece. */
export function diffBoards(prev: Board, next: Board): BoardDiff {
  const before = byId(prev);
  const after = byId(next);
  const diff: BoardDiff = { moves: [], captured: [], appeared: [], promoted: [] };
  for (const [id, a] of after) {
    const b = before.get(id);
    if (!b) {
      diff.appeared.push({ id, square: a.sq });
      continue;
    }
    if (b.sq !== a.sq) diff.moves.push({ id, from: b.sq, to: a.sq, hop: isKnightJump(b.sq, a.sq) });
    if (b.piece.type !== a.piece.type) diff.promoted.push({ id, square: a.sq });
  }
  for (const [id, b] of before) {
    if (!after.has(id)) diff.captured.push({ piece: b.piece, square: b.sq });
  }
  return diff;
}

/** Pieces that just became frozen or shielded. */
export function newEffects(prev: Effects, next: Effects): { frozen: string[]; shielded: string[] } {
  const had = (list: { pieceId: string }[], id: string) => list.some((e) => e.pieceId === id);
  return {
    frozen: next.frozen.filter((f) => !had(prev.frozen, f.pieceId)).map((f) => f.pieceId),
    shielded: next.shields.filter((s) => !had(prev.shields, s.pieceId)).map((s) => s.pieceId),
  };
}

export interface BoardMeta {
  army: Army;
  turn: number;
}

/** No animation for the first state, when the board turns around (Reverse), or when a new game starts. */
export function shouldAnimate(prev: BoardMeta | null, next: BoardMeta): boolean {
  return prev !== null && prev.army === next.army && next.turn >= prev.turn;
}
