import {
  legalFreezeTargets, legalRevives, legalShapeshifts, legalShieldTargets, legalSwaps, playableCards,
  type PlayableCard, type ReviveOption, type ShapeshiftOption,
} from './cards.js';
import { isInCheck, legalMoves } from './chess.js';
import { geometryFor, type Variant } from './geometry.js';
import { armyOf, ctxFor, isDeadArmy, opponentsOf } from './state.js';
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
  targets: PlayerId[]; // active opponents a targeted card may pick
}

export interface OpponentView {
  id: PlayerId;
  army: Army;
  handCount: number;
  eliminated: boolean;
}

export interface PlayerView {
  variant: Variant;
  you: PlayerId;
  opponents: OpponentView[]; // clockwise after the viewer
  yourArmy: Army;
  chess: ChessState;
  captured: GameState['captured'];
  effects: Effects;
  hand: Card[];
  drawPileCount: number;
  topDiscard: Card | null;
  current: PlayerId;
  turn: number;
  phase: Phase;
  inCheck: Army[]; // every army currently in check
  log: GameEvent[]; // last 50
  options: LegalOptions;
}

const LOG_LIMIT = 50;

function emptyOptions(): LegalOptions {
  return {
    cards: [], moves: [], canDoneMoving: false, swaps: [], freezeTargets: [], shieldTargets: [],
    shapeshifts: [], revives: [], targets: [],
  };
}

export function legalOptions(state: GameState, player: PlayerId): LegalOptions {
  if (state.current !== player || state.phase.kind === 'over') return emptyOptions();
  const army = armyOf(state, player);
  const phase = state.phase;
  if (phase.kind === 'moving') {
    return {
      ...emptyOptions(),
      targets: opponentsOf(state, player),
      moves: legalMoves(state.chess, army, ctxFor(state, army, phase.moved)),
      canDoneMoving: !phase.mustMove,
    };
  }
  if (phase.kind === 'awaitingCard') {
    return {
      ...emptyOptions(),
      targets: opponentsOf(state, player),
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

/** The other players in clockwise order starting after `player`, eliminated ones included. */
function opponentViews(state: GameState, player: PlayerId): OpponentView[] {
  const armies = geometryFor(state.variant).armies;
  const n = state.players.length;
  const start = state.players.indexOf(player);
  const out: OpponentView[] = [];
  for (let i = 1; i < n; i++) {
    const id = state.players[(start + i) % n];
    out.push({
      id,
      army: armies.find((a) => state.seats[a] === id)!,
      handCount: state.hands[id].length,
      eliminated: state.eliminated.includes(id),
    });
  }
  return out;
}

/** Everything one player may see: their own hand, only counts of everything hidden. */
export function viewFor(state: GameState, player: PlayerId): PlayerView {
  const armies = geometryFor(state.variant).armies;
  return {
    variant: state.variant,
    you: player,
    opponents: opponentViews(state, player),
    yourArmy: armyOf(state, player),
    chess: state.chess,
    captured: state.captured,
    effects: state.effects,
    hand: state.hands[player],
    drawPileCount: state.drawPile.length,
    topDiscard: state.discardPile.length > 0 ? state.discardPile[state.discardPile.length - 1] : null,
    current: state.current,
    turn: state.turn,
    phase: state.phase,
    inCheck: armies.filter((a) => !isDeadArmy(state, a) && isInCheck(state.chess, a)),
    log: state.log.slice(-LOG_LIMIT),
    options: legalOptions(state, player),
  };
}
