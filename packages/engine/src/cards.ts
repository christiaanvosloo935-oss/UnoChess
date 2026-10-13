import { isInCheck, movesAs, revokeCastling } from './chess.js';
import { armyOf, ctxFor as ctxForArmy, inCheckNow, opponentOf } from './state.js';
import type { Army, Card, ChessState, GameState, PieceType, PlayerId, PromotionType, Square } from './types.js';

export interface PlayableCard {
  cardId: string;
  asEffect: boolean;
  asOne: boolean;
}

/** Exchanges two squares' pieces, dropping castling rights for any home square involved. */
export function swapSquares(chess: ChessState, a: Square, b: Square): ChessState {
  const board = chess.board.slice();
  [board[a], board[b]] = [board[b], board[a]];
  return { board, castling: revokeCastling(chess.castling, a, b), ep: chess.ep };
}

function squareOfPiece(chess: ChessState, id: string): Square {
  return chess.board.findIndex((p) => p?.id === id);
}

/** Unordered pairs (ids sorted ascending) of own pieces that may legally swap. */
export function legalSwaps(state: GameState, player: PlayerId): [string, string][] {
  const army = armyOf(state, player);
  const enemy: Army = army === 'w' ? 'b' : 'w';
  const lastRank = army === 'w' ? 7 : 0;
  const own = state.chess.board
    .map((p, sq) => ({ p, sq }))
    .filter((x) => x.p && x.p.army === army) as { p: NonNullable<ChessState['board'][number]>; sq: Square }[];
  const out: [string, string][] = [];
  for (let i = 0; i < own.length; i++) {
    for (let j = i + 1; j < own.length; j++) {
      const next = swapSquares(state.chess, own[i].sq, own[j].sq);
      const pawnOnLastRank = [own[i].sq, own[j].sq].some((sq) => next.board[sq]!.type === 'p' && sq >> 3 === lastRank);
      if (pawnOnLastRank || isInCheck(next, army) || isInCheck(next, enemy)) continue;
      const [x, y] = [own[i].p.id, own[j].p.id].sort();
      out.push([x, y]);
    }
  }
  return out;
}

export function legalFreezeTargets(state: GameState, player: PlayerId): string[] {
  const army = armyOf(state, player);
  return state.chess.board.filter((p) => p && p.army !== army).map((p) => p!.id);
}

export function legalShieldTargets(state: GameState, player: PlayerId): string[] {
  const army = armyOf(state, player);
  return state.chess.board.filter((p) => p && p.army === army && p.type !== 'k').map((p) => p!.id);
}

export { squareOfPiece, opponentOf };

export interface ShapeshiftOption {
  pieceId: string;
  as: PieceType;
  to: Square;
  promotion?: PromotionType;
}

const ALL_TYPES: PieceType[] = ['p', 'n', 'b', 'r', 'q', 'k'];

/** Every one-move shapeshift the player could make: own unfrozen piece, borrowing a different piece type. */
export function legalShapeshifts(state: GameState, player: PlayerId): ShapeshiftOption[] {
  const army = armyOf(state, player);
  const ctx = ctxForArmy(state, army);
  const out: ShapeshiftOption[] = [];
  state.chess.board.forEach((piece, from) => {
    if (!piece || piece.army !== army) return;
    for (const as of ALL_TYPES) {
      if (as === piece.type) continue;
      for (const m of movesAs(state.chess, from, as, ctx)) {
        out.push({ pieceId: piece.id, as, to: m.to, ...(m.promotion ? { promotion: m.promotion } : {}) });
      }
    }
  });
  return out;
}

export interface ReviveOption {
  capturedIndex: number;
  square: Square;
  asQueen: boolean;
}

/** Captured pieces that may return to an empty square in the first two rows without giving check. */
export function legalRevives(state: GameState, player: PlayerId): ReviveOption[] {
  const army = armyOf(state, player);
  const enemy: Army = army === 'w' ? 'b' : 'w';
  const squares = army === 'w' ? range(0, 16) : range(48, 64);
  const out: ReviveOption[] = [];
  state.captured[army].forEach((type, capturedIndex) => {
    for (const asQueen of type === 'p' ? [false, true] : [false]) {
      for (const square of squares) {
        if (state.chess.board[square]) continue;
        const board = state.chess.board.slice();
        board[square] = { id: 'probe', type: asQueen ? 'q' : type, army };
        const next = { ...state.chess, board };
        if (isInCheck(next, army) || isInCheck(next, enemy)) continue;
        out.push({ capturedIndex, square, asQueen });
      }
    }
  });
  return out;
}

const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => from + i);

function escapesCheck(state: GameState, player: PlayerId, card: Card): boolean {
  if (card.kind === 'wild') return legalRevives(state, player).length > 0;
  if (card.kind !== 'num') return false;
  if (card.value! >= 1 && card.value! <= 5) return true;
  if (card.value === 6) return legalSwaps(state, player).length > 0;
  if (card.value === 8) return legalShapeshifts(state, player).length > 0;
  return false;
}

/** Which cards the player may play now, and how. In check only escaping effects or the "as a 1" fallback are allowed. */
export function playableCards(state: GameState, player: PlayerId): PlayableCard[] {
  if (state.phase.kind !== 'awaitingCard' || state.current !== player) return [];
  const inCheck = inCheckNow(state);
  return state.hands[player].map((card) => ({
    cardId: card.id,
    asEffect: !inCheck || escapesCheck(state, player, card),
    asOne: inCheck,
  }));
}
