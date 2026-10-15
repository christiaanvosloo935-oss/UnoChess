import { describe, expect, it } from 'vitest';
import { apply, createGame, nextPlayer, armyOf, activePlayers, opponentsOf, type Action, type GameState } from '../src/index.js';
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
    expect(g.drawPile).toHaveLength(87);
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

describe('targeted cards', () => {
  it('+2 needs a target with two opponents', () => {
    const d2 = card('draw2');
    let s = hexState({ pieces: K, hands: { A: [d2, num(0)] } });
    const bad = apply(s, 'A', play(d2));
    expect(bad).toEqual({ ok: false, error: 'Choose which opponent.' });
    s = ok(s, 'A', play(d2, { target: 'C' }));
    expect(s.hands.C).toHaveLength(3);
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
    let s = hexState({ pieces: K, hands: { A: [nine, num(0)], B: hb, C: hc } });
    s = ok(s, 'A', play(nine, { target: 'C' }));
    expect(s.hands.B).toEqual(hb);
    expect(s.hands.A.map((c) => c.id)).toContain(hc[0].id);
    expect(s.hands.C).toHaveLength(1); // the other 0 card, as the swap happens before A's draw
  });
  it('Switch Sides swaps armies between the player and the target only', () => {
    const rev = card('reverse');
    let s = hexState({ pieces: K, hands: { A: [rev, num(0)] } });
    s = ok(s, 'A', play(rev, { target: 'C' }));
    expect(s.seats).toEqual({ w: 'C', r: 'B', b: 'A' });
  });
  it('refuses a target who is eliminated or is yourself', () => {
    const d2 = card('draw2');
    const s = { ...hexState({ pieces: K, hands: { A: [d2, num(0)] } }), eliminated: ['B'] };
    expect(apply(s, 'A', play(d2, { target: 'B' }))).toEqual({ ok: false, error: "You can't choose that player." });
    const t = hexState({ pieces: K, hands: { A: [d2, num(0)] } });
    expect(apply(t, 'A', play(d2, { target: 'A' }))).toEqual({ ok: false, error: "You can't choose that player." });
    // with one active opponent left the target is filled in
    const r = apply(s, 'A', play(d2));
    expect(r.ok).toBe(true);
  });
  it('fills the target in automatically in a two-player game', () => {
    const d2 = card('draw2');
    const s = createGame(3, ['A', 'B']);
    const t = { ...s, hands: { ...s.hands, A: [d2, ...s.hands.A.slice(1)] } };
    const r = apply(t, 'A', play(d2));
    expect(r.ok).toBe(true);
  });
});
