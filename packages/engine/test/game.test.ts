import { describe, it, expect } from 'vitest';
import { START_FEN, createGame, apply, skipTurn, type Action, type Card, type GameState } from '../src/index.js';
import { card, num, sq, stateFrom, rest } from './helpers.js';

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
  it('deals 7 each, leaves 100, white to move, players[0] is white', () => {
    const g = createGame(42, ['A', 'B']);
    expect(g.hands.A).toHaveLength(7);
    expect(g.hands.B).toHaveLength(7);
    expect(g.drawPile).toHaveLength(100);
    expect(g.current).toBe('A');
    expect(g.players).toEqual(['A', 'B']);
    expect(g.seats).toEqual({ w: 'A', b: 'B' });
    expect(g.phase).toEqual({ kind: 'awaitingCard' });
  });
  it('is deterministic for a seed', () => {
    expect(createGame(5, ['A', 'B'])).toEqual(createGame(5, ['A', 'B']));
  });
});

describe('Joker (0 card)', () => {
  const as = (kind: Card['kind'], value?: number): Partial<Extract<Action, { type: 'playCard' }>> => ({
    joker: value === undefined ? { kind } : { kind, value },
  });

  it('a card that does nothing still draws back to 7 and hands the turn over', () => {
    const pass = rest();
    const s = stateFrom(START_FEN, { w: [pass, ...Array.from({ length: 5 }, () => num(3))] });
    const after = ok(s, 'A', play(pass));
    expect(after.hands.A).toHaveLength(7);
    expect(after.current).toBe('B');
    expect(after.turn).toBe(2);
    expect(after.discardPile.at(-1)).toEqual(pass);
  });

  it('becomes a move card: a Joker as a 3 gives three moves', () => {
    const joker = num(0);
    let s = stateFrom(START_FEN, { w: [joker] });
    s = ok(s, 'A', play(joker, as('num', 3)));
    expect(s.phase).toMatchObject({ kind: 'moving', movesLeft: 3 });
    expect(s.log.at(-1)!.text).toBe('played Joker as 3');
    expect(s.discardPile.at(-1)).toEqual(joker);
  });

  it('becomes Switch sides', () => {
    const joker = num(0);
    const after = ok(stateFrom(START_FEN, { w: [joker] }), 'A', play(joker, as('reverse')));
    expect(after.seats).toEqual({ w: 'B', b: 'A' });
    expect(after.current).toBe('B');
  });

  it('becomes a targeted effect and takes its args', () => {
    const joker = num(0);
    const s = stateFrom(START_FEN, { w: [joker] });
    const target = s.chess.board[sq('e7')]!.id;
    expect(fail(s, 'A', play(joker, as('num', 7)))).toMatch(/freeze/i);
    const after = ok(s, 'A', play(joker, { ...as('num', 7), args: { type: 'freeze', pieceId: target } }));
    expect(after.effects.frozen).toEqual([{ pieceId: target, army: 'b' }]);
  });

  it('becomes Draw four: the player draws the extra cards', () => {
    const joker = num(0);
    const s = stateFrom(START_FEN, { w: [joker], b: [num(1)] });
    const after = ok(s, 'A', play(joker, as('wild4')));
    expect(after.log.some((e) => e.text === 'drew 4 extra cards')).toBe(true);
  });

  it('must say what it becomes, and cannot become another Joker', () => {
    const joker = num(0);
    const s = stateFrom(START_FEN, { w: [joker] });
    expect(fail(s, 'A', play(joker))).toMatch(/Joker/);
    expect(fail(s, 'A', play(joker, as('num', 0)))).toMatch(/Joker/);
    expect(fail(s, 'A', play(joker, as('num', 12)))).toMatch(/Joker/);
  });

  it('a normal card ignores any joker field', () => {
    const three = num(3);
    const s = ok(stateFrom(START_FEN, { w: [three] }), 'A', play(three, as('wild4')));
    expect(s.phase).toMatchObject({ kind: 'moving', movesLeft: 3 });
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

  it('rule B: a piece may move twice on one card, never a third time', () => {
    const c = num(3);
    let s = stateFrom(START_FEN, { w: [c] });
    s = ok(s, 'A', play(c));
    s = ok(s, 'A', mv('e2', 'e3'));
    s = ok(s, 'A', mv('e3', 'e4'));
    expect(fail(s, 'A', mv('e4', 'e5'))).toMatch(/already moved twice/);
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
  it('in check, a plain card can only be played as a 1', () => {
    const z = rest();
    const s = stateFrom(FEN, { w: [z] });
    expect(fail(s, 'A', play(z))).toMatch(/in check/);
    const after = ok(s, 'A', play(z, { asOne: true }));
    expect(after.phase).toMatchObject({ kind: 'moving', movesLeft: 1, mustMove: true });
    expect(fail(after, 'A', { type: 'doneMoving' })).toBeTruthy();
    const escaped = ok(after, 'A', mv('e1', 'd1'));
    expect(escaped.phase).toEqual({ kind: 'awaitingCard' });
  });
  it('in check, a Joker may only become a card that escapes', () => {
    const j = num(0);
    const s = stateFrom(FEN, { w: [j] });
    expect(fail(s, 'A', play(j, { joker: { kind: 'wild4' } }))).toMatch(/escapes check/);
    expect(fail(s, 'A', play(j, { joker: { kind: 'reverse' } }))).toMatch(/escapes check/);
    expect(ok(s, 'A', play(j, { joker: { kind: 'num', value: 2 } })).phase).toMatchObject({ kind: 'moving', movesLeft: 2, mustMove: true });
    expect(ok(s, 'A', play(j, { asOne: true })).phase).toMatchObject({ kind: 'moving', movesLeft: 1 });
  });
  it('asOne is refused when not in check', () => {
    const z = rest();
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
    const frozen = stateFrom(FEN, { b: [c] }, { effects: { frozen: [{ pieceId: rook, army: 'w' }], shields: [] } });
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
    const z = rest();
    const base = stateFrom('7k/8/8/8/8/p7/P7/K7 b - - 0 1', { b: [z] });
    const king = base.chess.board[sq('a1')]!.id;
    const s = stateFrom('7k/8/8/8/8/p7/P7/K7 b - - 0 1', { b: [z] }, { effects: { frozen: [{ pieceId: king, army: 'w' }], shields: [] } });
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
    let s = stateFrom('4k3/8/8/8/3p4/8/4P3/4K3 w - - 0 1', { w: [w], b: [b1, rest()] });
    s = ok(ok(s, 'A', play(w)), 'A', mv('e2', 'e4'));
    expect(s.chess.ep).toMatchObject({ square: sq('e3'), capturer: 'b' });
    const taken = ok(ok(s, 'B', play(b1)), 'B', mv('d4', 'e3'));
    expect(taken.chess.board[sq('e4')]).toBeNull();
    expect(taken.captured.w).toEqual(['p']);
    const zero = s.hands.B[1];
    const passed = ok(s, 'B', play(zero));
    expect(passed.chess.ep).toBeNull();
  });

  it('castling uses one move of the king and one move of the rook', () => {
    const c = num(3);
    let s = stateFrom('4k3/8/8/8/8/8/P7/4K2R w K - 0 1', { w: [c] });
    s = ok(ok(s, 'A', play(c)), 'A', mv('e1', 'g1'));
    expect(s.chess.board[sq('f1')]).toMatchObject({ type: 'r' });
    s = ok(s, 'A', mv('f1', 'f2'));
    expect(fail(s, 'A', mv('f2', 'f3'))).toMatch(/already moved twice/);
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
    const hand = Array.from({ length: 8 }, () => rest());
    const s = stateFrom(START_FEN, { w: hand, b: Array.from({ length: 7 }, () => rest()) });
    const after = ok(s, 'A', play(hand[0]));
    expect(after.hands.A).toHaveLength(7);
    expect(after.drawPile).toHaveLength(20);
  });
});

describe('elimination and the hand', () => {
  it('a two-player checkmate leaves the loser\'s hand and the discard pile alone', () => {
    const c = num(1);
    const loser = Array.from({ length: 7 }, () => num(2)); // a full hand, so the top-up leaves it alone
    let s = stateFrom('rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 1', { b: [c], w: loser });
    s = ok(s, 'B', play(c));
    s = ok(s, 'B', mv('d8', 'h4'));
    expect(s.phase).toMatchObject({ kind: 'over', reason: 'checkmate' });
    expect(s.hands.A).toEqual(loser);
    expect(s.discardPile.map((x) => x.id)).not.toContain(loser[0].id);
  });
  it('a two-player resignation leaves the resigner\'s hand alone', () => {
    const hand = [num(2), num(3)];
    const s = ok(stateFrom(START_FEN, { w: hand }), 'A', { type: 'resign' });
    expect(s.hands.A).toEqual(hand);
    expect(s.discardPile).toEqual([]);
  });
});

describe('skipTurn (turn timer ran out)', () => {
  it('passes the turn without playing a card, keeping the hand', () => {
    const c = num(3);
    const s = stateFrom(START_FEN, { w: [c, ...Array.from({ length: 6 }, () => num(2))] });
    const r = skipTurn(s);
    if (!r.ok) throw new Error(r.error);
    expect(r.state.current).toBe('B');
    expect(r.state.turn).toBe(2);
    expect(r.state.hands.A.map((x) => x.id)).toEqual(s.hands.A.map((x) => x.id));
    expect(r.state.discardPile).toEqual([]);
    expect(r.state.log.at(-1)).toMatchObject({ player: 'A', text: 'ran out of time and skips their turn' });
  });

  it('ends a card that was already started, keeping the moves made', () => {
    const c = num(3);
    let s = stateFrom(START_FEN, { w: [c] });
    s = ok(s, 'A', play(c));
    s = ok(s, 'A', mv('e2', 'e4'));
    const r = skipTurn(s);
    if (!r.ok) throw new Error(r.error);
    expect(r.state.current).toBe('B');
    expect(r.state.phase).toEqual({ kind: 'awaitingCard' });
    expect(r.state.chess.board[sq('e4')]).toMatchObject({ type: 'p', army: 'w' });
  });

  it("lets the skipped player's frozen pieces thaw, like a normal turn", () => {
    const frozenId = stateFrom(START_FEN).chess.board[sq('e2')]!.id;
    const s = stateFrom(START_FEN, {}, { effects: { frozen: [{ pieceId: frozenId, army: 'w' }], shields: [] } });
    const r = skipTurn(s);
    if (!r.ok) throw new Error(r.error);
    expect(r.state.effects.frozen).toEqual([]);
  });

  it('is refused once the game is over', () => {
    const s = ok(stateFrom(START_FEN), 'B', { type: 'resign' });
    expect(skipTurn(s)).toEqual({ ok: false, error: 'The game is over.' });
  });
});
