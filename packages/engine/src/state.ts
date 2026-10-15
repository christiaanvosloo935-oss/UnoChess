import { geometryFor } from './geometry.js';
import { isInCheck, type MoveContext } from './chess.js';
import type { Army, GameState, PlayerId } from './types.js';

export function armyOf(state: GameState, player: PlayerId): Army {
  const armies = geometryFor(state.variant).armies;
  return armies.find((a) => state.seats[a] === player) ?? armies[0];
}

/** Players still in the game, clockwise from the first seat. */
export function activePlayers(state: GameState): PlayerId[] {
  return state.players.filter((p) => !state.eliminated.includes(p));
}

/** Every active player except `player`. */
export function opponentsOf(state: GameState, player: PlayerId): PlayerId[] {
  return activePlayers(state).filter((p) => p !== player);
}

/** The next active player clockwise after `player` (which may itself be eliminated). */
export function nextPlayer(state: GameState, player: PlayerId): PlayerId {
  const n = state.players.length;
  const start = state.players.indexOf(player);
  for (let i = 1; i <= n; i++) {
    const candidate = state.players[(start + i) % n];
    if (!state.eliminated.includes(candidate)) return candidate;
  }
  return player;
}

/** The first opponent; the only one in a two-player game. */
export function opponentOf(state: GameState, player: PlayerId): PlayerId {
  return opponentsOf(state, player)[0] ?? player;
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
