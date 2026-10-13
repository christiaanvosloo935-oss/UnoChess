import {
  legalFreezeTargets, legalRevives, legalShapeshifts, legalShieldTargets, legalSwaps, playableCards,
  type PlayableCard, type ReviveOption, type ShapeshiftOption,
} from './cards.js';
import { isInCheck, legalMoves } from './chess.js';
import { armyOf, ctxFor, opponentOf } from './state.js';
import type {
  Army, Card, ChessState, Effects, GameEvent, GameState, Move, Phase, PlayerId,
} from './types.js';

export interface LegalOptions {
  cards: PlayableCard[];
  moves: Move[]; // in the 'moving' phase: legal moves for this step
  canDoneMoving: boolean;
  swaps: [string, string][];
  freezeTargets: string[];
  shieldTargets: string[];
  shapeshifts: ShapeshiftOption[];
  revives: ReviveOption[];
}

export interface PlayerView {
  you: PlayerId;
  opponent: PlayerId;
  yourArmy: Army;
  chess: ChessState;
  captured: GameState['captured'];
  effects: Effects;
  hand: Card[];
  opponentHandCount: number;
  drawPileCount: number;
  topDiscard: Card | null;
  current: PlayerId;
  turn: number;
  phase: Phase;
  inCheck: Army | null;
  log: GameEvent[]; // last 50
  options: LegalOptions;
}

const LOG_LIMIT = 50;

function emptyOptions(): LegalOptions {
  return {
    cards: [], moves: [], canDoneMoving: false, swaps: [], freezeTargets: [], shieldTargets: [],
    shapeshifts: [], revives: [],
  };
}

export function legalOptions(state: GameState, player: PlayerId): LegalOptions {
  if (state.current !== player) return emptyOptions();
  const army = armyOf(state, player);
  const phase = state.phase;
  if (phase.kind === 'moving') {
    return {
      ...emptyOptions(),
      moves: legalMoves(state.chess, army, ctxFor(state, army, phase.moved)),
      canDoneMoving: !phase.mustMove,
    };
  }
  if (phase.kind === 'awaitingCard') {
    return {
      ...emptyOptions(),
      cards: playableCards(state, player),
      swaps: legalSwaps(state, player),
      freezeTargets: legalFreezeTargets(state, player),
      shieldTargets: legalShieldTargets(state, player),
      shapeshifts: legalShapeshifts(state, player),
      revives: legalRevives(state, player),
    };
  }
  return emptyOptions();
}

/** Everything one player may see: their own hand, only counts of everything hidden. */
export function viewFor(state: GameState, player: PlayerId): PlayerView {
  const opponent = opponentOf(state, player);
  const toMoveArmy = armyOf(state, state.current);
  return {
    you: player,
    opponent,
    yourArmy: armyOf(state, player),
    chess: state.chess,
    captured: state.captured,
    effects: state.effects,
    hand: state.hands[player],
    opponentHandCount: state.hands[opponent].length,
    drawPileCount: state.drawPile.length,
    topDiscard: state.discardPile.length > 0 ? state.discardPile[state.discardPile.length - 1] : null,
    current: state.current,
    turn: state.turn,
    phase: state.phase,
    inCheck: isInCheck(state.chess, toMoveArmy) ? toMoveArmy : null,
    log: state.log.slice(-LOG_LIMIT),
    options: legalOptions(state, player),
  };
}
