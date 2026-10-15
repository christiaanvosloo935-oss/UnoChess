import { describe, it, expect } from 'vitest';
import { START_FEN, apply, viewFor, legalOptions, type Action, type GameState } from '../src/index.js';
import { card, num, sq, stateFrom } from './helpers.js';

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
    expect(view.opponentHandCount).toBe(3);
    expect(view.drawPileCount).toBe(20);
    expect(view.hand.map((c) => c.id)).toEqual(s.hands.A.map((c) => c.id));
  });

  it('shows only the top of the discard pile', () => {
    const zero = num(0);
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

  it('in the moving phase the options exclude already-moved pieces', () => {
    const c = num(2);
    let s = stateFrom(START_FEN, { w: [c] });
    s = ok(s, 'A', { type: 'playCard', cardId: c.id });
    s = ok(s, 'A', { type: 'move', from: sq('e2'), to: sq('e4') });
    const { moves, canDoneMoving } = viewFor(s, 'A').options;
    expect(canDoneMoving).toBe(true);
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every((m) => m.from !== sq('e4'))).toBe(true);
  });

  it('exposes swap / freeze / shield / shapeshift / revive options for the current player', () => {
    const s = stateFrom('4k3/8/8/8/8/8/PP6/R3K3 w Q - 0 1', { w: [card('wild')] }, { captured: { w: ['n'], b: [] } });
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
    expect(viewFor(s, 'A').inCheck).toBe('w');
    s = stateFrom(START_FEN, { w: [nine, num(1)], b: [num(3), num(4)] });
    s = ok(s, 'A', { type: 'playCard', cardId: nine.id });
    const json = JSON.stringify(viewFor(s, 'B').log);
    for (const c of [...s.hands.A, ...s.hands.B]) expect(json).not.toContain(c.id);
  });
});
