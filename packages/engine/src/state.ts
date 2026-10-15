import { enemiesOf, geometryFor } from './geometry.js';
import { isInCheck, type MoveContext } from './chess.js';
import type { Army, ChessState, GameState, PlayerId } from './types.js';

export function armyOf(state: GameState, player: PlayerId): Army {
  const armies = geometryFor(state.variant).armies;
  const army = armies.find((a) => state.seats[a] === player);
  if (!army) throw new Error(`Player ${player} has no army in this game.`);
  return army;
}

/** True when the army's controller has been eliminated: its pieces stay on the board but never move. */
export function isDeadArmy(state: GameState, army: Army): boolean {
  const owner = state.seats[army];
  return owner !== undefined && state.eliminated.includes(owner);
}

/** The armies that can attack `army`'s king and are still in play (an eliminated king's check no longer matters). */
export function liveEnemiesOf(state: GameState, army: Army): Army[] {
  return enemiesOf(state.variant, army).filter((e) => !isDeadArmy(state, e));
}

/** The live enemies of `army` that are in check right now. */
export function checkedEnemies(state: GameState, army: Army): Army[] {
  return liveEnemiesOf(state, army).filter((e) => isInCheck(state.chess, e));
}

/**
 * True when `chess` puts a live enemy of `army` in check that was not already in check
 * (`before`, from `checkedEnemies`): only a newly created check counts as given by the mover.
 */
export function givesNewCheck(state: GameState, chess: ChessState, army: Army, before: Army[]): boolean {
  return liveEnemiesOf(state, army).some((e) => !before.includes(e) && isInCheck(chess, e));
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
