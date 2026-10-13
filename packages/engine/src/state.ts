import { isInCheck, type MoveContext } from './chess.js';
import type { Army, GameState, PlayerId } from './types.js';

export function armyOf(state: GameState, player: PlayerId): Army {
  return state.seats.w === player ? 'w' : 'b';
}

export function opponentOf(state: GameState, player: PlayerId): PlayerId {
  return state.players[0] === player ? state.players[1] : state.players[0];
}

export function inCheckNow(state: GameState): boolean {
  return isInCheck(state.chess, armyOf(state, state.current));
}

/** Move-generation context for an army: its frozen pieces, every shielded piece, and pieces already moved. */
export function ctxFor(state: GameState, army: Army, moved: readonly string[] = []): MoveContext {
  return {
    frozen: new Set(state.effects.frozen.filter((f) => f.army === army).map((f) => f.pieceId)),
    shielded: new Set(state.effects.shields.map((s) => s.pieceId)),
    moved: new Set(moved),
    turn: state.turn,
  };
}
