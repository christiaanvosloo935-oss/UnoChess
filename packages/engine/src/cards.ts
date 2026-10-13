import { isInCheck, revokeCastling } from './chess.js';
import { armyOf, inCheckNow, opponentOf } from './state.js';
import type { Army, Card, ChessState, GameState, PlayerId, Square } from './types.js';

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

function escapesCheck(state: GameState, player: PlayerId, card: Card): boolean {
  if (card.kind !== 'num') return false;
  if (card.value! >= 1 && card.value! <= 5) return true;
  if (card.value === 6) return legalSwaps(state, player).length > 0;
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
