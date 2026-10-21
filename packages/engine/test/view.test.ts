import { describe, it, expect } from 'vitest';
import { START_FEN, apply, viewFor, legalOptions, type Action, type GameState } from '../src/index.js';
import { card, hexState, num, sq, stateFrom, rest } from './helpers.js';

function ok(state: GameState, player: string, action: Action): GameState {
  const r = apply(state, player, action);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

describe('viewFor', () => {
  it("hides the opponent's hand and the draw pile", () => {
    const s = stateFrom(START_FEN, { w: [num(1), num(2)], b: [num(3), num(4), num(5)] });
    const json = JSON.stringify(viewFor(s, 'A'));
    for (const c of s.hands.B) expect(json).not.toContain(`"${c.id}"`);
    for (const c of s.drawPile) expect(json).not.toContain(`"${c.id}"`);
    const view = viewFor(s, 'A');
    expect(view.opponents[0].handCount).toBe(3);
    expect(view.opponents).toEqual([{ id: 'B', army: 'b', handCount: 3, eliminated: false, hand: null }]);
    expect(view.variant).toBe('classic');
    expect(view.drawPileCount).toBe(20);
    expect(view.hand.map((c) => c.id)).toEqual(s.hands.A.map((c) => c.id));
  });

  it("reveals the winner's hand to a checkmated player only", () => {
    const one = num(1);
    let s = stateFrom('7k/5Q2/6K1/8/8/8/8/8 w - - 0 1', { w: [one, num(4), num(5)], b: [num(2)] });
    expect(viewFor(s, 'B').opponents[0].hand).toBeNull();
    s = ok(s, 'A', { type: 'playCard', cardId: one.id });
    s = ok(s, 'A', { type: 'move', from: sq('f7'), to: sq('g7') });
    expect(s.phase).toMatchObject({ kind: 'over', winner: 'A', reason: 'checkmate' });
    expect(viewFor(s, 'B').opponents[0].hand?.map((c) => c.id)).toEqual(s.hands.A.map((c) => c.id));
    expect(viewFor(s, 'A').opponents[0].hand).toBeNull();
  });

  it('keeps hands hidden when a game ends any other way', () => {
    const s = ok(stateFrom(START_FEN), 'B', { type: 'resign' });
    expect(viewFor(s, 'A').opponents[0].hand).toBeNull();
    expect(viewFor(s, 'B').opponents[0].hand).toBeNull();
  });

  it('shows only the top of the discard pile', () => {
    const zero = rest();
    let s = stateFrom(START_FEN, { w: [zero, num(1)] });
    s = ok(s, 'A', { type: 'playCard', cardId: zero.id });
    const view = viewFor(s, 'B');
    expect(view.topDiscard).toEqual(zero);
    expect(JSON.stringify(view)).not.toContain('discardPile');
  });

  it('reports who played the last card, as a one or as its effect', () => {
    const two = num(2);
    const s = stateFrom(START_FEN, { w: [two, num(1)], b: [num(3)] });
    expect(viewFor(s, 'B').lastPlayed).toBeNull();
    const after = ok(s, 'A', { type: 'playCard', cardId: two.id });
    expect(viewFor(after, 'B').lastPlayed).toEqual({ player: 'A', card: two, asOne: false });
    expect(viewFor(after, 'A').lastPlayed).toEqual({ player: 'A', card: two, asOne: false });
  });

  it('options are empty when it is not your turn', () => {
    const s = stateFrom(START_FEN, { w: [num(1)], b: [num(1)] });
    const opts = viewFor(s, 'B').options;
    expect(opts.cards).toEqual([]);
    expect(opts.moves).toEqual([]);
    expect(opts.canDoneMoving).toBe(false);
    expect(viewFor(s, 'A').options.cards).toHaveLength(1);
  });

  it('in the moving phase the options exclude pieces that used up their two moves', () => {
    const c = num(3);
    let s = stateFrom(START_FEN, { w: [c] });
    s = ok(s, 'A', { type: 'playCard', cardId: c.id });
    s = ok(s, 'A', { type: 'move', from: sq('e2'), to: sq('e3') });
    s = ok(s, 'A', { type: 'move', from: sq('e3'), to: sq('e4') });
    const { moves, canDoneMoving } = viewFor(s, 'A').options;
    expect(canDoneMoving).toBe(true);
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every((m) => m.from !== sq('e4'))).toBe(true);
  });

  it('exposes swap / freeze / shield / shapeshift / revive options for the current player', () => {
    const s = stateFrom('4k3/8/8/8/8/8/PP6/R3K3 w Q - 0 1', { w: [card('wild')] }, { captured: { w: ['n'], r: [], b: [] } });
    const o = legalOptions(s, 'A');
    expect(o.swaps.length).toBeGreaterThan(0);
    expect(o.freezeTargets).toHaveLength(1);
    expect(o.shieldTargets).toHaveLength(3);
    expect(o.shapeshifts.length).toBeGreaterThan(0);
    expect(o.revives.length).toBeGreaterThan(0);
  });

  it('flags the army in check and keeps the log public-only', () => {
    const nine = num(9);
    let s = stateFrom('4r1k1/8/8/8/8/8/8/4K3 w - - 0 1', { w: [nine], b: [num(1)] });
    expect(viewFor(s, 'A').inCheck).toEqual(['w']);
    s = stateFrom(START_FEN, { w: [nine, num(1)], b: [num(3), num(4)] });
    s = ok(s, 'A', { type: 'playCard', cardId: nine.id });
    const json = JSON.stringify(viewFor(s, 'B').log);
    for (const c of [...s.hands.A, ...s.hands.B]) expect(json).not.toContain(c.id);
  });

  const threeHands = () => ({
    A: [num(1), num(2)], B: [num(3), num(4), num(5)], C: [num(6)],
  });
  const threeState = (extra: Partial<GameState> = {}) => ({
    ...hexState({
      pieces: [['w', 'k', 'w.e1'], ['r', 'k', 'r.e1'], ['b', 'k', 'b.e1']],
      hands: threeHands(),
    }),
    ...extra,
  });

  it('three-player view lists two opponents with hand counts and hides every other hand', () => {
    const s = threeState();
    expect(s.drawPile.length).toBeGreaterThan(0);
    for (const me of s.players) {
      const view = viewFor(s, me);
      const json = JSON.stringify(view);
      expect(view.variant).toBe('three');
      expect(view.opponents).toHaveLength(2);
      expect(view.opponents.map((o) => o.id)).toEqual(
        [0, 1].map((i) => s.players[(s.players.indexOf(me) + 1 + i) % 3]),
      );
      for (const o of view.opponents) {
        expect(o.handCount).toBe(s.hands[o.id].length);
        expect(o.army).toBe(Object.entries(s.seats).find(([, p]) => p === o.id)![0]);
        for (const c of s.hands[o.id]) expect(json).not.toContain(`"${c.id}"`);
      }
      for (const c of s.drawPile) expect(json).not.toContain(`"${c.id}"`);
      expect(view.hand.map((c) => c.id)).toEqual(s.hands[me].map((c) => c.id));
    }
  });

  it('inCheck lists every army in check', () => {
    const s = hexState({
      pieces: [
        ['w', 'k', 'w.e1'], ['r', 'k', 'r.e1'], ['b', 'k', 'b.e1'],
        ['r', 'r', 'w.e3'], // red rook on the white king's file
        ['w', 'r', 'r.e3'], // white rook on the red king's file
      ],
    });
    const inCheck = viewFor(s, 'A').inCheck;
    expect([...inCheck].sort()).toEqual(['r', 'w']);
    expect(viewFor(threeState(), 'A').inCheck).toEqual([]);
  });

  it('inCheck excludes an eliminated army', () => {
    const s = {
      ...hexState({
        pieces: [
          ['w', 'k', 'w.e1'], ['r', 'k', 'r.e1'], ['b', 'k', 'b.e1'],
          ['r', 'r', 'w.e3'], ['w', 'r', 'r.e3'],
        ],
      }),
      eliminated: ['B'],
    };
    expect(viewFor(s, 'A').inCheck).toEqual(['w']);
  });

  it('options.targets is the active opponents on your turn and empty otherwise', () => {
    const s = threeState();
    expect(viewFor(s, 'A').options.targets).toEqual(['B', 'C']);
    expect(viewFor(s, 'B').options.targets).toEqual([]);
    const afterElim = threeState({ eliminated: ['C'] });
    expect(viewFor(afterElim, 'A').options.targets).toEqual(['B']);
    expect(viewFor(afterElim, 'A').opponents.find((o) => o.id === 'C')?.eliminated).toBe(true);
    const over = threeState({ phase: { kind: 'over', winner: 'A', reason: 'resign' } });
    expect(viewFor(over, 'A').options.targets).toEqual([]);
    expect(viewFor(stateFrom(START_FEN), 'A').options.targets).toEqual(['B']);
  });
});
