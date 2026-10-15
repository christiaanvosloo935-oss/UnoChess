import { describe, it, expect } from 'vitest';
import {
  apply, buildDeck, exhaustedPieces, viewFor, MAX_MOVES_PER_PIECE, START_FEN,
  type Action, type GameState,
} from '../src/index.js';
import { card, hexState, num, sq, stateFrom } from './helpers.js';

const play = (c: { id: string }): Action => ({ type: 'playCard', cardId: c.id });
const mv = (from: string, to: string): Action => ({ type: 'move', from: sq(from), to: sq(to) });
function ok(s: GameState, player: string, a: Action): GameState {
  const r = apply(s, player, a);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}
function fail(s: GameState, player: string, a: Action): string {
  const r = apply(s, player, a);
  if (r.ok) throw new Error('expected a failure');
  return r.error;
}
const zeros = (n: number) => Array.from({ length: n }, () => num(0));

describe('players are topped up to 7 cards', () => {
  it('after a card the player draws up to 7, not just one card', () => {
    const s = stateFrom(START_FEN, { w: zeros(3) });
    const after = ok(s, 'A', play(s.hands.A[0]));
    expect(after.hands.A).toHaveLength(7);
  });

  it('Trade Hands tops both players up to 7 straight away', () => {
    const trade = num(9);
    const s = stateFrom(START_FEN, { w: [trade, ...zeros(5)], b: zeros(1) });
    const after = ok(s, 'A', play(trade));
    expect(after.hands.A).toHaveLength(7); // took B's single card, then drew 6
    expect(after.hands.B).toHaveLength(7); // took A's 5 cards, then drew 2
  });

  it('a hand of 7 or more never draws', () => {
    const s = stateFrom(START_FEN, { w: zeros(9), b: zeros(8) });
    const after = ok(s, 'A', play(s.hands.A[0]));
    expect(after.hands.A).toHaveLength(8);
    expect(after.hands.B).toHaveLength(8);
  });

  it('Draw Two still adds its cards on top of 7', () => {
    const draw2 = card('draw2');
    const s = stateFrom(START_FEN, { w: [draw2, ...zeros(6)], b: zeros(7) });
    const after = ok(s, 'A', play(draw2));
    expect(after.hands.B).toHaveLength(9);
    expect(after.hands.A).toHaveLength(7);
  });

  it('with three players everyone still in is topped up, an eliminated player is not', () => {
    const base = hexState({
      pieces: [['w', 'k', 'w.e1'], ['r', 'k', 'r.e1'], ['b', 'k', 'b.e1']],
      hands: { A: zeros(2), B: zeros(4), C: zeros(5) },
    });
    const alive = ok(base, 'A', play(base.hands.A[0]));
    expect(alive.hands.A).toHaveLength(7);
    expect(alive.hands.B).toHaveLength(7);
    expect(alive.hands.C).toHaveLength(7);
    const out = ok({ ...base, eliminated: ['C'], hands: { ...base.hands, C: [] } }, 'A', play(base.hands.A[0]));
    expect(out.hands.C).toHaveLength(0);
    expect(out.hands.B).toHaveLength(7);
  });

  it('when the piles run dry a hand stays short and play continues', () => {
    const s = stateFrom(START_FEN, { w: zeros(3) }, { drawPile: zeros(2), discardPile: [] });
    const after = ok(s, 'A', play(s.hands.A[0]));
    expect(after.hands.A.length).toBeLessThan(7);
    expect(after.current).toBe('B');
  });
});

describe('a piece may move twice per card', () => {
  it('exhaustedPieces lists the pieces that used their moves', () => {
    expect(MAX_MOVES_PER_PIECE).toBe(2);
    expect(exhaustedPieces(['x', 'y', 'x', 'z'])).toEqual(new Set(['x']));
    expect(exhaustedPieces([])).toEqual(new Set());
  });

  it('the same piece can make a second move but not a third', () => {
    const three = num(3);
    let s = stateFrom(START_FEN, { w: [three] });
    s = ok(s, 'A', play(three));
    s = ok(s, 'A', mv('e2', 'e3'));
    s = ok(s, 'A', mv('e3', 'e4'));
    expect(s.phase).toMatchObject({ kind: 'moving', movesLeft: 1 });
    expect(fail(s, 'A', mv('e4', 'e5'))).toMatch(/already moved twice/);
    s = ok(s, 'A', mv('d2', 'd3'));
    expect(s.phase).toEqual({ kind: 'awaitingCard' });
  });

  it('the view offers a piece that moved once and stops offering it after the second move', () => {
    const four = num(4);
    let s = stateFrom(START_FEN, { w: [four] });
    s = ok(s, 'A', play(four));
    s = ok(s, 'A', mv('e2', 'e3'));
    expect(viewFor(s, 'A').options.moves.some((m) => m.from === sq('e3'))).toBe(true);
    s = ok(s, 'A', mv('e3', 'e4'));
    expect(viewFor(s, 'A').options.moves.some((m) => m.from === sq('e4'))).toBe(false);
    expect(viewFor(s, 'A').options.moves.some((m) => m.from === sq('d2'))).toBe(true);
  });

  it('castling uses one move of the king and one of the rook', () => {
    const three = num(3);
    let s = stateFrom('4k3/8/8/8/8/8/P7/4K2R w K - 0 1', { w: [three] });
    s = ok(ok(s, 'A', play(three)), 'A', mv('e1', 'g1'));
    s = ok(s, 'A', mv('f1', 'f2')); // the rook still has one move left
    expect(fail(s, 'A', mv('f2', 'f3'))).toMatch(/already moved twice/);
  });

  it('giving check still ends the card', () => {
    const four = num(4);
    let s = stateFrom('4k3/8/8/8/8/8/8/R3K3 w - - 0 1', { w: [four] });
    s = ok(s, 'A', play(four));
    s = ok(s, 'A', mv('a1', 'a8'));
    expect(s.phase).toEqual({ kind: 'awaitingCard' });
    expect(s.current).toBe('B');
  });
});

describe('15% more cards numbered 1 to 5', () => {
  it('has 46 of them, so 114 cards in all', () => {
    const deck = buildDeck();
    const count = (v: number) => deck.filter((c) => c.kind === 'num' && c.value === v).length;
    expect([1, 2, 3, 4, 5].map(count)).toEqual([9, 9, 10, 9, 9]);
    expect([0, 6, 7, 8, 9].map(count)).toEqual([4, 8, 8, 8, 8]);
    expect([1, 2, 3, 4, 5].reduce((n, v) => n + count(v), 0)).toBe(46);
    expect(deck).toHaveLength(114);
    expect(new Set(deck.map((c) => c.id)).size).toBe(114);
  });
});
