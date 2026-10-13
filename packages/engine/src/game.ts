import { applyChessMove, isInCheck, legalMoves, movesAs } from './chess.js';
import { legalFreezeTargets, legalRevives, legalShapeshifts, legalShieldTargets, legalSwaps, playableCards, squareOfPiece, swapSquares } from './cards.js';
import { buildDeck, drawCards } from './deck.js';
import { fromFen, START_FEN } from './fen.js';
import { shuffle } from './rng.js';
import { armyOf, ctxFor, inCheckNow, opponentOf } from './state.js';
import type { Action, ApplyResult, Army, Card, EffectArgs, GameState, Move, PlayerId } from './types.js';

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
  const args = action.args;
  switch (card.kind) {
    case 'num':
      if (card.value === 0) return endCard(s, player, playedArmy);
      if (card.value! <= 5) return startMoving(s, player, card.id, card.value!);
      if (card.value === 6) return swapEffect(s, player, playedArmy, args);
      if (card.value === 7) return freezeEffect(s, player, playedArmy, args);
      if (card.value === 8) return shapeshiftEffect(s, player, playedArmy, args);
      if (card.value === 9) return tradeEffect(s, player, playedArmy);
      return 'That card is not implemented yet.';
    case 'skip': return shieldEffect(s, player, playedArmy, args);
    case 'reverse': return reverseEffect(s, player, playedArmy);
    case 'draw2': return penaltyEffect(s, player, playedArmy, 2);
    case 'wild4': return penaltyEffect(s, player, playedArmy, 4);
    case 'wild': return reviveEffect(s, player, playedArmy, args);
  }
}

function swapEffect(s: GameState, player: PlayerId, playedArmy: Army, args?: EffectArgs): string | void {
  const pairs = legalSwaps(s, player);
  if (pairs.length > 0) {
    if (args?.type !== 'swap') return 'Pick two of your pieces to swap.';
    const [x, y] = [args.a, args.b].sort();
    if (!pairs.some(([a, b]) => a === x && b === y)) return "Those two pieces can't be swapped.";
    s.chess = swapSquares(s.chess, squareOfPiece(s.chess, x), squareOfPiece(s.chess, y));
    log(s, player, 'swapped two of their pieces');
  } else {
    log(s, player, 'had no legal swap');
  }
  endCard(s, player, playedArmy);
}

function freezeEffect(s: GameState, player: PlayerId, playedArmy: Army, args?: EffectArgs): string | void {
  const targets = legalFreezeTargets(s, player);
  if (targets.length > 0) {
    if (args?.type !== 'freeze' || !targets.includes(args.pieceId)) return 'Pick an enemy piece to freeze.';
    const target = s.chess.board.find((p) => p?.id === args.pieceId)!;
    s.effects.frozen = s.effects.frozen.filter((f) => f.pieceId !== target.id);
    s.effects.frozen.push({ pieceId: target.id, army: target.army });
    log(s, player, `froze an enemy ${PIECE_NAMES[target.type]}`);
  }
  endCard(s, player, playedArmy);
}

function shieldEffect(s: GameState, player: PlayerId, playedArmy: Army, args?: EffectArgs): string | void {
  const targets = legalShieldTargets(s, player);
  if (targets.length > 0) {
    if (args?.type !== 'shield' || !targets.includes(args.pieceId)) return 'Pick one of your pieces (not the king) to shield.';
    s.effects.shields = s.effects.shields.filter((sh) => sh.pieceId !== args.pieceId);
    s.effects.shields.push({ pieceId: args.pieceId, owner: player });
    log(s, player, 'shielded a piece');
  }
  endCard(s, player, playedArmy);
}

function tradeEffect(s: GameState, player: PlayerId, playedArmy: Army): void {
  const other = opponentOf(s, player);
  [s.hands[player], s.hands[other]] = [s.hands[other], s.hands[player]];
  log(s, player, 'traded hands');
  endCard(s, player, playedArmy);
}

function reverseEffect(s: GameState, player: PlayerId, playedArmy: Army): void {
  s.seats = { w: s.seats.b, b: s.seats.w };
  log(s, player, 'switched sides');
  endCard(s, player, playedArmy);
}

function penaltyEffect(s: GameState, player: PlayerId, playedArmy: Army, count: number): void {
  const other = opponentOf(s, player);
  const drawn = drawFor(s, other, count);
  s.effects.pendingSkip = other;
  log(s, player, `made their opponent draw ${drawn}`);
  endCard(s, player, playedArmy);
}

const PIECE_NAMES = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' } as const;

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
  commitMove(s, player, move);
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

/** Applies a chess move to the game state and records any capture. */
function commitMove(s: GameState, player: PlayerId, move: Move): void {
  const result = applyChessMove(s.chess, move, s.turn);
  s.chess = result.chess;
  if (result.captured) {
    s.captured[result.captured.army].push(result.captured.type);
    log(s, player, `captured a ${PIECE_NAMES[result.captured.type]}`);
  }
}

function shapeshiftEffect(s: GameState, player: PlayerId, playedArmy: Army, args?: EffectArgs): string | void {
  const army = armyOf(s, player);
  const options = legalShapeshifts(s, player);
  if (options.length === 0) {
    log(s, player, 'had no legal shapeshift');
    return endCard(s, player, playedArmy);
  }
  if (args?.type !== 'shapeshift') return 'Pick a piece, a piece type to borrow, and a destination.';
  const matches = options.filter((o) => o.pieceId === args.pieceId && o.as === args.as && o.to === args.to);
  if (matches.length === 0) return "That piece can't move like that.";
  if (matches.some((o) => o.promotion) && !args.promotion) return 'Choose a promotion piece';
  const from = squareOfPiece(s.chess, args.pieceId);
  const move = movesAs(s.chess, from, args.as, ctxFor(s, army)).find(
    (m) => m.to === args.to && m.promotion === args.promotion,
  );
  if (!move) return "That piece can't move like that.";
  log(s, player, `shapeshifted a ${PIECE_NAMES[s.chess.board[from]!.type]} into a ${PIECE_NAMES[args.as]}`);
  commitMove(s, player, move);
  if (isInCheck(s.chess, army === 'w' ? 'b' : 'w')) log(s, player, 'Check!');
  endCard(s, player, playedArmy);
}

function reviveEffect(s: GameState, player: PlayerId, playedArmy: Army, args?: EffectArgs): string | void {
  const army = armyOf(s, player);
  const options = legalRevives(s, player);
  if (options.length > 0) {
    if (args?.type !== 'revive') return 'Pick a captured piece and an empty square in your first two rows.';
    const option = options.find(
      (o) => o.capturedIndex === args.capturedIndex && o.square === args.square && o.asQueen === !!args.asQueen,
    );
    if (!option) return "That piece can't be revived there.";
    const [type] = s.captured[army].splice(option.capturedIndex, 1);
    const board = s.chess.board.slice();
    board[option.square] = { id: `r${s.nextPieceId++}`, type: option.asQueen ? 'q' : type, army };
    s.chess = { ...s.chess, board };
    log(s, player, `revived a ${PIECE_NAMES[option.asQueen ? 'q' : type]}`);
  } else {
    log(s, player, 'had nothing to revive');
  }
  endCard(s, player, playedArmy);
}

function doneMoving(s: GameState, player: PlayerId): string | void {
  if (s.phase.kind !== 'moving') return 'There is nothing to finish.';
  if (s.phase.mustMove) return "You're in check: you must make a move that escapes it.";
  return endCard(s, player, armyOf(s, player));
}

/** Finishes the current card: draw step, expire effects, pass the turn, then judge the new position. */
export function endCard(s: GameState, player: PlayerId, playedArmy: Army): void {
  if (s.hands[player].length < HAND_SIZE) drawFor(s, player, 1);
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
  // Trade Hands can leave a player with nothing to play; they draw one so the game never stalls.
  if (s.hands[s.current].length === 0) drawFor(s, s.current, 1);
  judge(s);
}

/** Moves up to n cards from the draw pile (reshuffling the discard pile when needed) into a player's hand. */
function drawFor(s: GameState, player: PlayerId, n: number): number {
  const drawn = drawCards(s, n);
  s.hands[player].push(...drawn.cards);
  s.drawPile = drawn.piles.drawPile;
  s.discardPile = drawn.piles.discardPile;
  s.seed = drawn.piles.seed;
  return drawn.cards.length;
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
