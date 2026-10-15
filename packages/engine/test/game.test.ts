import { describe, it, expect } from 'vitest';
import { START_FEN, createGame, apply, type Action, type GameState } from '../src/index.js';
import { card, num, sq, stateFrom } from './helpers.js';

function ok(state: GameState, player: string, action: Action): GameState {
  const r = apply(state, player, action);
  if (!r.ok) throw new Error(`expected ok, got: ${r.error}`);
  return r.state;
}
function fail(state: GameState, player: string, action: Action): string {
  const before = structuredClone(state);
  const r = apply(state, player, action);
  expect(state).toEqual(before);
  if (r.ok) throw new Error('expected an error');
  return r.error;
}
const mv = (from: string, to: string, promotion?: 'q' | 'r' | 'b' | 'n'): Action =>
  ({ type: 'move', from: sq(from), to: sq(to), ...(promotion ? { promotion } : {}) });
const play = (c: { id: string }, extra: Partial<Extract<Action, { type: 'playCard' }>> = {}): Action =>
  ({ type: 'playCard', cardId: c.id, ...extra });

describe('createGame', () => {
  it('deals 7 each, leaves 94, white to move, players[0] is white', () => {
    const g = createGame(42, ['A', 'B']);
    expect(g.hands.A).toHaveLength(7);
    expect(g.hands.B).toHaveLength(7);
    expect(g.drawPile).toHaveLength(94);
    expect(g.current).toBe('A');
    expect(g.players).toEqual(['A', 'B']);
    expect(g.seats).toEqual({ w: 'A', b: 'B' });
    expect(g.phase).toEqual({ kind: 'awaitingCard' });
  });
  it('is deterministic for a seed', () => {
    expect(createGame(5, ['A', 'B'])).toEqual(createGame(5, ['A', 'B']));
  });
});

describe('0 card', () => {
  it('passes, draws back to 7, hands the turn over', () => {
    const zero = num(0);
    const s = stateFrom(START_FEN, { w: [zero, ...Array.from({ length: 5 }, () => num(3))] });
    const after = ok(s, 'A', play(zero));
    expect(after.hands.A).toHaveLength(6);
    expect(after.current).toBe('B');
    expect(after.turn).toBe(2);
    expect(after.phase).toEqual({ kind: 'awaitingCard' });
    expect(after.discardPile.at(-1)).toEqual(zero);
  });
});

describe('move cards', () => {
  it('card 3: three different pieces move, then the turn passes', () => {
    const c = num(3);
    let s = stateFrom(START_FEN, { w: [c] });
    s = ok(s, 'A', play(c));
    expect(s.phase).toMatchObject({ kind: 'moving', movesLeft: 3 });
    s = ok(s, 'A', mv('e2', 'e4'));
    s = ok(s, 'A', mv('d2', 'd4'));
    expect(s.current).toBe('A');
    s = ok(s, 'A', mv('g1', 'f3'));
    expect(s.phase).toEqual({ kind: 'awaitingCard' });
    expect(s.current).toBe('B');
  });

  it('rule B: the same piece cannot move twice', () => {
    const c = num(2);
    let s = stateFrom(START_FEN, { w: [c] });
    s = ok(s, 'A', play(c));
    s = ok(s, 'A', mv('e2', 'e3'));
    expect(fail(s, 'A', mv('e3', 'e4'))).toMatch(/already moved/);
  });

  it('rule A: giving check ends the turn with moves left', () => {
    const c = num(4);
    let s = stateFrom('4k3/8/8/8/8/8/8/R3K2R w - - 0 1', { w: [c] });
    s = ok(s, 'A', play(c));
    s = ok(s, 'A', mv('h1', 'h2'));
    expect(s.phase).toMatchObject({ kind: 'moving', movesLeft: 3 });
    s = ok(s, 'A', mv('a1', 'a8'));
    expect(s.phase).toEqual({ kind: 'awaitingCard' });
    expect(s.current).toBe('B');
  });

  it('doneMoving ends a 4-card after 1 move', () => {
    const c = num(4);
    let s = stateFrom(START_FEN, { w: [c] });
    s = ok(s, 'A', play(c));
    s = ok(s, 'A', mv('e2', 'e4'));
    s = ok(s, 'A', { type: 'doneMoving' });
    expect(s.phase).toEqual({ kind: 'awaitingCard' });
    expect(s.current).toBe('B');
  });

  it('a promotion move without a piece is rejected, with a piece it works', () => {
    const c = num(1);
    let s = stateFrom('4k3/P7/8/8/8/8/8/4K3 w - - 0 1', { w: [c] });
    s = ok(s, 'A', play(c));
    expect(fail(s, 'A', mv('a7', 'a8'))).toBe('Choose a promotion piece');
    const done = ok(s, 'A', mv('a7', 'a8', 'q'));
    expect(done.chess.board[sq('a8')]).toMatchObject({ type: 'q', army: 'w' });
  });
});

describe('check handling (rule C, §5.3)', () => {
  const FEN = '4r1k1/8/8/8/8/8/8/4K3 w - - 0 1';
  it('in check, a 0 can only be played as a 1', () => {
    const z = num(0);
    const s = stateFrom(FEN, { w: [z] });
    expect(fail(s, 'A', play(z))).toMatch(/in check/);
    const after = ok(s, 'A', play(z, { asOne: true }));
    expect(after.phase).toMatchObject({ kind: 'moving', movesLeft: 1, mustMove: true });
    expect(fail(after, 'A', { type: 'doneMoving' })).toBeTruthy();
    const escaped = ok(after, 'A', mv('e1', 'd1'));
    expect(escaped.phase).toEqual({ kind: 'awaitingCard' });
  });
  it('asOne is refused when not in check', () => {
    const z = num(0);
    const s = stateFrom(START_FEN, { w: [z] });
    expect(fail(s, 'A', play(z, { asOne: true }))).toMatch(/in check/);
  });
  it('a move card in check must start with an escaping move', () => {
    const c = num(2);
    let s = stateFrom(FEN, { w: [c] });
    s = ok(s, 'A', play(c));
    expect(s.phase).toMatchObject({ mustMove: true });
    expect(fail(s, 'A', { type: 'move', from: sq('e1'), to: sq('e2') })).toBeTruthy();
  });
});

describe('game end', () => {
  it('checkmate is decided by the board (fool\'s mate)', () => {
    const c = num(1);
    let s = stateFrom('rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 1', { b: [c] });
    s = ok(s, 'B', play(c));
    s = ok(s, 'B', mv('d8', 'h4'));
    expect(s.phase).toEqual({ kind: 'over', winner: 'B', reason: 'checkmate' });
  });

  it('a frozen escape piece counts for checkmate', () => {
    const FEN = '6k1/R7/8/8/8/8/r5PP/7K b - - 0 1';
    const c = num(1);
    const free = stateFrom(FEN, { b: [c] });
    const rook = free.chess.board[sq('a7')]!.id;
    const after = ok(ok(free, 'B', play(c)), 'B', mv('a2', 'a1'));
    expect(after.phase).toEqual({ kind: 'awaitingCard' });
    const frozen = stateFrom(FEN, { b: [c] }, { effects: { frozen: [{ pieceId: rook, army: 'w' }], shields: [], pendingSkips: [] } });
    const mated = ok(ok(frozen, 'B', play(c)), 'B', mv('a2', 'a1'));
    expect(mated.phase).toEqual({ kind: 'over', winner: 'B', reason: 'checkmate' });
  });

  it('stalemate is a draw', () => {
    const c = num(1);
    let s = stateFrom('7k/4Q3/6K1/8/8/8/8/8 w - - 0 1', { w: [c] });
    s = ok(s, 'A', play(c));
    s = ok(s, 'A', mv('e7', 'f7'));
    expect(s.phase).toEqual({ kind: 'over', winner: null, reason: 'stalemate' });
  });

  it('stalemate ignores freezes', () => {
    const z = num(0);
    const base = stateFrom('7k/8/8/8/8/p7/P7/K7 b - - 0 1', { b: [z] });
    const king = base.chess.board[sq('a1')]!.id;
    const s = stateFrom('7k/8/8/8/8/p7/P7/K7 b - - 0 1', { b: [z] }, { effects: { frozen: [{ pieceId: king, army: 'w' }], shields: [], pendingSkips: [] } });
    expect(ok(s, 'B', play(z)).phase).toEqual({ kind: 'awaitingCard' });
  });

  it('resign: either player, even off turn', () => {
    const s = stateFrom(START_FEN);
    const after = ok(s, 'B', { type: 'resign' });
    expect(after.phase).toEqual({ kind: 'over', winner: 'A', reason: 'resign' });
    expect(fail(after, 'A', { type: 'resign' })).toMatch(/over/);
  });
});

describe('special chess moves', () => {
  it('en passant works on the immediately following turn only', () => {
    const w = num(1);
    const b1 = num(1);
    let s = stateFrom('4k3/8/8/8/3p4/8/4P3/4K3 w - - 0 1', { w: [w], b: [b1, num(0)] });
    s = ok(ok(s, 'A', play(w)), 'A', mv('e2', 'e4'));
    expect(s.chess.ep).toMatchObject({ square: sq('e3'), capturer: 'b' });
    const taken = ok(ok(s, 'B', play(b1)), 'B', mv('d4', 'e3'));
    expect(taken.chess.board[sq('e4')]).toBeNull();
    expect(taken.captured.w).toEqual(['p']);
    const zero = s.hands.B[1];
    const passed = ok(s, 'B', play(zero));
    expect(passed.chess.ep).toBeNull();
  });

  it('castling counts as the king move and marks the rook moved', () => {
    const c = num(3);
    let s = stateFrom('4k3/8/8/8/8/8/P7/4K2R w K - 0 1', { w: [c] });
    s = ok(ok(s, 'A', play(c)), 'A', mv('e1', 'g1'));
    expect(s.chess.board[sq('f1')]).toMatchObject({ type: 'r' });
    expect(fail(s, 'A', mv('f1', 'f2'))).toMatch(/already moved/);
  });
});

describe('stale and out-of-turn actions', () => {
  it('rejects an action when it is not your turn and leaves state unchanged', () => {
    const c = num(1);
    const s = stateFrom(START_FEN, { w: [num(1)], b: [c] });
    expect(fail(s, 'B', play(c))).toMatch(/not your turn/);
  });
  it('rejects a repeated move without touching the state', () => {
    const c = num(2);
    let s = stateFrom(START_FEN, { w: [c] });
    s = ok(ok(s, 'A', play(c)), 'A', mv('e2', 'e4'));
    fail(s, 'A', mv('e2', 'e4'));
  });
  it('rejects a card that is not in the hand, and moves outside a card', () => {
    const s = stateFrom(START_FEN);
    expect(fail(s, 'A', play(num(1)))).toMatch(/hand/);
    expect(fail(s, 'A', mv('e2', 'e4'))).toBeTruthy();
  });
});

describe('draw step', () => {
  it('does not draw when the hand still has 7 or more cards', () => {
    const hand = Array.from({ length: 8 }, () => num(0));
    const s = stateFrom(START_FEN, { w: hand });
    const after = ok(s, 'A', play(hand[0]));
    expect(after.hands.A).toHaveLength(7);
    expect(after.drawPile).toHaveLength(20);
  });
});
