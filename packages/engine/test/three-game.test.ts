import { describe, expect, it } from 'vitest';
import { apply, createGame, isInCheck, nextPlayer, armyOf, activePlayers, opponentsOf, type Action, type GameState } from '../src/index.js';
import { card, hexState, num } from './helpers.js';

const K: [import('../src/index.js').Army, import('../src/index.js').PieceType, string][] = [
  ['w', 'k', 'w.e1'], ['r', 'k', 'r.e1'], ['b', 'k', 'b.e1'],
];
const play = (c: { id: string }, extra: Partial<Extract<Action, { type: 'playCard' }>> = {}): Action =>
  ({ type: 'playCard', cardId: c.id, ...extra });
function ok(s: GameState, p: string, a: Action): GameState {
  const r = apply(s, p, a);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

describe('createGame for three', () => {
  it('sets up variant, seats, hands and board', () => {
    const g = createGame(7, ['A', 'B', 'C'], 'three');
    expect(g.variant).toBe('three');
    expect(g.players).toEqual(['A', 'B', 'C']);
    expect(g.seats).toEqual({ w: 'A', r: 'B', b: 'C' });
    expect(g.eliminated).toEqual([]);
    for (const p of g.players) expect(g.hands[p]).toHaveLength(7);
    expect(g.drawPile).toHaveLength(93);
    expect(g.chess.board).toHaveLength(96);
    expect(g.chess.board.filter(Boolean)).toHaveLength(48);
    expect(g.current).toBe('A');
  });
});

describe('turn order', () => {
  it('is clockwise', () => {
    let s = hexState({ pieces: K, hands: { A: [num(0)], B: [num(0)], C: [num(0)] } });
    s = ok(s, 'A', play(s.hands.A[0]));
    expect(s.current).toBe('B');
    s = ok(s, 'B', play(s.hands.B[0]));
    expect(s.current).toBe('C');
    s = ok(s, 'C', play(s.hands.C[0]));
    expect(s.current).toBe('A');
  });
  it('nextPlayer skips an eliminated player', () => {
    const s = { ...hexState({ pieces: K }), eliminated: ['B'] };
    expect(nextPlayer(s, 'A')).toBe('C');
    expect(nextPlayer(s, 'C')).toBe('A');
    expect(activePlayers(s)).toEqual(['A', 'C']);
    expect(opponentsOf(s, 'A')).toEqual(['C']);
    expect(armyOf(s, 'B')).toBe('r');
  });
});

describe('seats and sizes', () => {
  it('armyOf throws for a player without an army', () => {
    const s = hexState({ pieces: K });
    expect(() => armyOf(s, 'Z')).toThrow();
  });
  it('createGame needs one player per army', () => {
    expect(() => createGame(1, ['A', 'B'], 'three')).toThrow();
    expect(() => createGame(1, ['A', 'B', 'C'], 'classic')).toThrow();
    expect(() => createGame(1, ['A'], 'classic')).toThrow();
  });
});

describe('moving on the three-player board', () => {
  it('castling uses one move of the king and one of the rook', () => {
    const three = num(3);
    const s0 = hexState({
      pieces: [['w', 'k', 'w.e1'], ['w', 'r', 'w.h1'], ['w', 'r', 'w.a1'], ['r', 'k', 'r.e1'], ['b', 'k', 'b.e1']],
      hands: { A: [three] },
      rights: { w: { k: true, q: true } },
    });
    let s = ok(s0, 'A', play(three));
    s = ok(s, 'A', { type: 'move', from: 4, to: 6 });
    expect(s.chess.board[5]).toMatchObject({ type: 'r', army: 'w' });
    expect(s.phase).toMatchObject({ kind: 'moving', movesLeft: 2 });
    if (s.phase.kind !== 'moving') throw new Error('phase');
    expect(s.phase.moved).toContain(s.chess.board[5]!.id);
    s = ok(s, 'A', { type: 'move', from: 5, to: 13 }); // the rook still has one move left
    expect(apply(s, 'A', { type: 'move', from: 13, to: 21 })).toEqual({ ok: false, error: 'That piece has already moved twice this turn.' });
    expect(apply(s, 'A', { type: 'move', from: 0, to: 8 }).ok).toBe(true); // the other rook may still move
  });
  it('giving check to the red player ends a movement card', () => {
    const three = num(3);
    const s0 = hexState({
      pieces: [['w', 'k', 'w.e1'], ['w', 'r', 'w.a2'], ['r', 'k', 'r.e1'], ['b', 'k', 'b.a1']],
      hands: { A: [three] },
    });
    expect(isInCheck(s0.chess, 'r')).toBe(false);
    let s = ok(s0, 'A', play(three));
    s = ok(s, 'A', { type: 'move', from: 8, to: 11 }); // w.a2 to w.d2
    expect(isInCheck(s.chess, 'r')).toBe(true);
    expect(s.log.map((e) => e.text)).toContain('Check!');
    expect(s.phase).toEqual({ kind: 'awaitingCard' });
    expect(s.current).toBe('B');
  });
  it('giving check to the black player ends a movement card', () => {
    const three = num(3);
    const s0 = hexState({
      pieces: [['w', 'k', 'w.a1'], ['w', 'r', 'w.h2'], ['r', 'k', 'r.a1'], ['b', 'k', 'b.d1']],
      hands: { A: [three] },
    });
    expect(isInCheck(s0.chess, 'b')).toBe(false);
    let s = ok(s0, 'A', play(three));
    s = ok(s, 'A', { type: 'move', from: 15, to: 12 }); // w.h2 to w.e2
    expect(isInCheck(s.chess, 'b')).toBe(true);
    expect(s.log.map((e) => e.text)).toContain('Check!');
    expect(s.phase).toEqual({ kind: 'awaitingCard' });
    expect(s.current).toBe('B');
  });
});

const seven = () => Array.from({ length: 7 }, () => num(0));

describe('targeted cards', () => {
  it('+2 needs a target with two opponents', () => {
    const d2 = card('draw2');
    let s = hexState({ pieces: K, hands: { A: [d2, num(0)], C: seven() } });
    const bad = apply(s, 'A', play(d2));
    expect(bad).toEqual({ ok: false, error: 'Choose which opponent.' });
    s = ok(s, 'A', play(d2, { target: 'C' }));
    expect(s.hands.C).toHaveLength(9);
    expect(s.effects.pendingSkips).toEqual(['C']);
    expect(s.current).toBe('B');
    s = ok(s, 'B', play(s.hands.B[0]));
    expect(s.current).toBe('A');
    expect(s.effects.pendingSkips).toEqual([]);
  });
  it('two skips at once', () => {
    const a = card('draw2');
    const b = card('draw2');
    let s = hexState({ pieces: K, hands: { A: [a, num(0)], B: [b, num(0)] } });
    s = ok(s, 'A', play(a, { target: 'C' }));
    s = ok(s, 'B', play(b, { target: 'A' }));
    expect(s.current).toBe('B');
    expect(s.effects.pendingSkips).toEqual([]);
  });
  it('Trade Hands swaps only with the target', () => {
    const nine = num(9);
    const hb = [num(1), num(2)];
    const hc = [num(3)];
    const zeroCard = num(0);
    let s = hexState({ pieces: K, hands: { A: [nine, zeroCard], B: hb, C: hc } });
    s = ok(s, 'A', play(nine, { target: 'C' }));
    expect(s.hands.B.slice(0, 2)).toEqual(hb); // B kept its own cards (and was topped up to 7)
    expect(s.hands.A.map((c) => c.id)).toContain(hc[0].id);
    expect(s.hands.C[0]).toEqual(zeroCard); // C received A's other card
    expect([s.hands.A, s.hands.B, s.hands.C].map((h) => h.length)).toEqual([7, 7, 7]);
  });
  it('Switch Sides swaps armies between the player and the target only', () => {
    const rev = card('reverse');
    let s = hexState({ pieces: K, hands: { A: [rev, num(0)] } });
    s = ok(s, 'A', play(rev, { target: 'C' }));
    expect(s.seats).toEqual({ w: 'C', r: 'B', b: 'A' });
  });
  it('refuses a target who is eliminated or is yourself', () => {
    const d2 = card('draw2');
    const s = { ...hexState({ pieces: K, hands: { A: [d2, num(0)], C: seven() } }), eliminated: ['B'] };
    expect(apply(s, 'A', play(d2, { target: 'B' }))).toEqual({ ok: false, error: "You can't choose that player." });
    const t = hexState({ pieces: K, hands: { A: [d2, num(0)] } });
    expect(apply(t, 'A', play(d2, { target: 'A' }))).toEqual({ ok: false, error: "You can't choose that player." });
    // with one active opponent left the target is filled in
    const r = apply(s, 'A', play(d2));
    if (!r.ok) throw new Error(r.error);
    expect(r.state.hands.C).toHaveLength(9); // C, the only active opponent, gets the cards
    expect(r.state.hands.B).toHaveLength(1);
    expect(r.state.current).toBe('A'); // B is eliminated and C is skipped
    expect(r.state.effects.pendingSkips).toEqual([]);
  });
  it('fills the target in automatically in a two-player game', () => {
    const d2 = card('draw2');
    const s = createGame(3, ['A', 'B']);
    const t = { ...s, hands: { ...s.hands, A: [d2, ...s.hands.A.slice(1)] } };
    const r = apply(t, 'A', play(d2));
    if (!r.ok) throw new Error(r.error);
    expect(r.state.hands.B).toHaveLength(9); // B draws two
    expect(r.state.current).toBe('A'); // B is skipped
    expect(r.state.effects.pendingSkips).toEqual([]);
    expect(r.state.log.map((e) => e.text)).toContain('made Black draw 2');
  });
  it('names the chosen seat in the log', () => {
    const d2 = card('draw2');
    const s = hexState({ pieces: K, hands: { A: [d2, num(0)] } });
    expect(ok(s, 'A', play(d2, { target: 'B' })).log.map((e) => e.text)).toContain('made Red draw 2');
    expect(ok(s, 'A', play(d2, { target: 'C' })).log.map((e) => e.text)).toContain('made Black draw 2');
  });
  it('a second +2 on an already-skipped player draws the cards but does not stack the skip', () => {
    const d2 = card('draw2');
    const base = hexState({ pieces: K, hands: { A: [d2, num(0)], C: seven() } });
    const s = ok({ ...base, effects: { ...base.effects, pendingSkips: ['C'] } }, 'A', play(d2, { target: 'C' }));
    expect(s.hands.C).toHaveLength(9);
    expect(s.effects.pendingSkips).toEqual(['C']);
    expect(s.current).toBe('B');
  });
});
