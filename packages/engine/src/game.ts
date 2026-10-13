import { applyChessMove, isInCheck, legalMoves } from './chess.js';
import { playableCards } from './cards.js';
import { buildDeck, drawCards } from './deck.js';
import { fromFen, START_FEN } from './fen.js';
import { shuffle } from './rng.js';
import { armyOf, ctxFor, inCheckNow, opponentOf } from './state.js';
import type { Action, ApplyResult, Army, Card, GameState, PlayerId } from './types.js';

export { armyOf, inCheckNow, opponentOf };

const HAND_SIZE = 7;

export function createGame(seed: number, white: PlayerId, black: PlayerId): GameState {
  const [deck, nextSeed] = shuffle(buildDeck(), seed);
  return {
    chess: fromFen(START_FEN).chess,
    captured: { w: [], b: [] },
    players: [white, black],
    seats: { w: white, b: black },
    hands: { [white]: deck.slice(0, HAND_SIZE), [black]: deck.slice(HAND_SIZE, HAND_SIZE * 2) },
    drawPile: deck.slice(HAND_SIZE * 2),
    discardPile: [],
    seed: nextSeed,
    current: white,
    turn: 1,
    phase: { kind: 'awaitingCard' },
    effects: { frozen: [], shields: [], pendingSkip: null },
    nextPieceId: 0,
    log: [],
  };
}

export function cardLabel(card: Card): string {
  switch (card.kind) {
    case 'num': return String(card.value);
    case 'skip': return 'Skip';
    case 'reverse': return 'Reverse';
    case 'draw2': return '+2';
    case 'wild': return 'Wild';
    case 'wild4': return '+4';
  }
}

function log(s: GameState, player: PlayerId, text: string): void {
  s.log.push({ turn: s.turn, player, text });
}

export function apply(state: GameState, player: PlayerId, action: Action): ApplyResult {
  if (!state.players.includes(player)) return { ok: false, error: 'You are not in this game.' };
  const s = structuredClone(state);
  const before = s.log.length;
  const error = dispatch(s, player, action);
  if (error) return { ok: false, error };
  return { ok: true, state: s, events: s.log.slice(before) };
}

function dispatch(s: GameState, player: PlayerId, action: Action): string | void {
  if (s.phase.kind === 'over') return 'The game is over.';
  if (action.type === 'resign') {
    s.phase = { kind: 'over', winner: opponentOf(s, player), reason: 'resign' };
    log(s, player, 'resigned');
    return;
  }
  if (player !== s.current) return "It's not your turn.";
  switch (action.type) {
    case 'playCard': return playCard(s, player, action);
    case 'move': return makeMove(s, player, action);
    case 'doneMoving': return doneMoving(s, player);
    default: return 'Unknown action.';
  }
}

function playCard(s: GameState, player: PlayerId, action: Extract<Action, { type: 'playCard' }>): string | void {
  if (s.phase.kind !== 'awaitingCard') return 'Finish your current card first.';
  const hand = s.hands[player];
  const idx = hand.findIndex((c) => c.id === action.cardId);
  if (idx < 0) return "That card isn't in your hand.";
  const card = hand[idx];
  const option = playableCards(s, player).find((o) => o.cardId === card.id)!;
  const asOne = !!action.asOne;
  if (asOne && !option.asOne) return 'You can only play a card as a 1 while you are in check.';
  if (!asOne && !option.asEffect) {
    return 'You are in check: play a card that escapes it, or play any card as a 1.';
  }
  const playedArmy = armyOf(s, player);
  hand.splice(idx, 1);
  s.discardPile.push(card);
  log(s, player, asOne ? `played ${cardLabel(card)} as a 1` : `played ${cardLabel(card)}`);

  if (asOne) return startMoving(s, player, card.id, 1);
  if (card.kind === 'num') {
    if (card.value === 0) return endCard(s, player, playedArmy);
    return startMoving(s, player, card.id, card.value!);
  }
  return 'That card is not implemented yet.';
}

function startMoving(s: GameState, player: PlayerId, cardId: string, movesLeft: number): void {
  const army = armyOf(s, player);
  s.phase = { kind: 'moving', cardId, movesLeft, moved: [], mustMove: isInCheck(s.chess, army) };
  if (legalMoves(s.chess, army, ctxFor(s, army)).length === 0) endCard(s, player, army);
}

function makeMove(s: GameState, player: PlayerId, action: Extract<Action, { type: 'move' }>): string | void {
  const phase = s.phase;
  if (phase.kind !== 'moving') return 'Play a move card first.';
  const army = armyOf(s, player);
  const piece = s.chess.board[action.from];
  if (!piece || piece.army !== army) return 'Pick one of your own pieces.';
  if (phase.moved.includes(piece.id)) return 'That piece has already moved this turn.';
  const ctx = ctxFor(s, army, phase.moved);
  if (ctx.frozen!.has(piece.id)) return 'That piece is frozen.';
  const candidates = legalMoves(s.chess, army, ctx).filter((m) => m.from === action.from && m.to === action.to);
  if (candidates.length === 0) {
    return phase.mustMove ? "You're in check: your first move must escape it." : "That move isn't legal.";
  }
  const move = action.promotion ? candidates.find((m) => m.promotion === action.promotion) : candidates.find((m) => !m.promotion);
  if (!move) return candidates.some((m) => m.promotion) ? 'Choose a promotion piece' : "That move isn't legal.";

  const rookId = move.castle
    ? s.chess.board[(action.from >> 3) * 8 + (move.castle === 'k' ? 7 : 0)]!.id
    : null;
  const result = applyChessMove(s.chess, move, s.turn);
  s.chess = result.chess;
  if (result.captured) {
    s.captured[result.captured.army].push(result.captured.type);
    log(s, player, `captured a ${result.captured.type === 'p' ? 'pawn' : result.captured.type}`);
  }
  phase.moved.push(piece.id);
  if (rookId) phase.moved.push(rookId);
  phase.movesLeft -= 1;
  phase.mustMove = false;

  const opponent: Army = army === 'w' ? 'b' : 'w';
  if (isInCheck(s.chess, opponent)) {
    log(s, player, 'Check!');
    return endCard(s, player, army);
  }
  if (phase.movesLeft === 0 || legalMoves(s.chess, army, ctxFor(s, army, phase.moved)).length === 0) {
    return endCard(s, player, army);
  }
}

function doneMoving(s: GameState, player: PlayerId): string | void {
  if (s.phase.kind !== 'moving') return 'There is nothing to finish.';
  if (s.phase.mustMove) return "You're in check: you must make a move that escapes it.";
  return endCard(s, player, armyOf(s, player));
}

/** Finishes the current card: draw step, expire effects, pass the turn, then judge the new position. */
export function endCard(s: GameState, player: PlayerId, playedArmy: Army): void {
  if (s.hands[player].length < HAND_SIZE) {
    const drawn = drawCards(s, 1);
    s.hands[player].push(...drawn.cards);
    s.drawPile = drawn.piles.drawPile;
    s.discardPile = drawn.piles.discardPile;
    s.seed = drawn.piles.seed;
  }
  s.effects.frozen = s.effects.frozen.filter((f) => f.army !== playedArmy);
  if (s.chess.ep && s.chess.ep.setOnTurn !== s.turn) s.chess.ep = null;
  s.turn += 1;
  s.current = opponentOf(s, player);
  for (;;) {
    s.effects.shields = s.effects.shields.filter((sh) => sh.owner !== s.current);
    if (s.effects.pendingSkip !== s.current) break;
    s.effects.pendingSkip = null;
    log(s, s.current, 'skips their turn');
    s.chess.ep = null;
    s.turn += 1;
    s.current = opponentOf(s, s.current);
  }
  judge(s);
}

function judge(s: GameState): void {
  const army = armyOf(s, s.current);
  const ctx = ctxFor(s, army);
  if (isInCheck(s.chess, army)) {
    if (legalMoves(s.chess, army, ctx).length === 0) {
      s.phase = { kind: 'over', winner: opponentOf(s, s.current), reason: 'checkmate' };
      log(s, s.current, 'is checkmated');
      return;
    }
  } else if (legalMoves(s.chess, army, { ...ctx, frozen: new Set() }).length === 0) {
    s.phase = { kind: 'over', winner: null, reason: 'stalemate' };
    log(s, s.current, 'is stalemated');
    return;
  }
  s.phase = { kind: 'awaitingCard' };
}
