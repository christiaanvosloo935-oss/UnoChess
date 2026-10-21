import { describe, it, expect } from 'vitest';
import {
  START_FEN, apply, legalSwaps, legalShieldTargets, legalFreezeTargets, playableCards, armyOf,
  type Action, type GameState,
} from '../src/index.js';
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
const idAt = (s: GameState, name: string) => s.chess.board[sq(name)]!.id;
const play = (c: { id: string }, args?: Extract<Action, { type: 'playCard' }>['args']): Action =>
  ({ type: 'playCard', cardId: c.id, ...(args ? { args } : {}) });
const mv = (from: string, to: string): Action => ({ type: 'move', from: sq(from), to: sq(to) });
const pairHas = (pairs: [string, string][], a: string, b: string) =>
  pairs.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

describe('6 · Swap', () => {
  it('swaps rook and king (rulebook p.4) and drops castling rights', () => {
    const six = num(6);
    const s = stateFrom('6k1/8/8/8/8/8/PPPP4/R3K3 w Q - 0 1', { w: [six] });
    const after = ok(s, 'A', play(six, { type: 'swap', a: idAt(s, 'a1'), b: idAt(s, 'e1') }));
    expect(after.chess.board[sq('a1')]).toMatchObject({ type: 'k' });
    expect(after.chess.board[sq('e1')]).toMatchObject({ type: 'r' });
    expect(after.chess.castling.w).toEqual({ k: false, q: false });
    expect(after.current).toBe('B');
  });

  it('may not give check', () => {
    const s = stateFrom('4k3/8/8/8/8/8/P7/R3K3 w Q - 0 1', { w: [num(6)] });
    const pairs = legalSwaps(s, 'A');
    expect(pairs.length).toBeGreaterThan(0);
    expect(pairHas(pairs, idAt(s, 'a1'), idAt(s, 'e1'))).toBe(false);
    expect(fail(s, 'A', play(s.hands.A[0], { type: 'swap', a: idAt(s, 'a1'), b: idAt(s, 'e1') }))).toMatch(/swap/i);
  });

  it('may not leave your own king in check', () => {
    const s = stateFrom('4r1k1/8/8/8/8/8/4B3/R3K3 w Q - 0 1', { w: [num(6)] });
    const pairs = legalSwaps(s, 'A');
    expect(pairHas(pairs, idAt(s, 'e2'), idAt(s, 'e1'))).toBe(false);
    expect(pairHas(pairs, idAt(s, 'a1'), idAt(s, 'e2'))).toBe(true);
  });

  it('may not put a pawn on its last rank', () => {
    const s = stateFrom('1N2k3/P7/8/8/8/8/8/4K3 w - - 0 1', { w: [num(6)] });
    const pairs = legalSwaps(s, 'A');
    expect(pairHas(pairs, idAt(s, 'a7'), idAt(s, 'b8'))).toBe(false);
    expect(pairs.length).toBeGreaterThan(0);
  });

  it('a swap that escapes check is playable as an effect while in check', () => {
    const six = num(6);
    const zero = rest();
    const s = stateFrom('4r1k1/8/8/8/8/8/8/R3K3 w Q - 0 1', { w: [six, zero] });
    const options = playableCards(s, 'A');
    expect(options.find((o) => o.cardId === six.id)).toMatchObject({ asEffect: true, asOne: true });
    expect(options.find((o) => o.cardId === zero.id)).toMatchObject({ asEffect: false, asOne: true });
  });

  it('with no legal swap the card resolves with no effect', () => {
    const six = num(6);
    const s = stateFrom('4k3/8/8/8/8/8/8/4K3 w - - 0 1', { w: [six] });
    const after = ok(s, 'A', play(six));
    expect(after.chess).toEqual(s.chess);
    expect(after.current).toBe('B');
  });
});

describe('6 · Swap and frozen pieces', () => {
  it('a frozen piece cannot be swapped', () => {
    const six = num(6);
    const base = stateFrom('4k3/p6r/8/8/8/8/8/K7 b - - 0 1', { b: [six] });
    const pawn = idAt(base, 'a7');
    const king = idAt(base, 'e8');
    const rook = idAt(base, 'h7');
    expect(pairHas(legalSwaps(base, 'B'), pawn, king)).toBe(true);
    const frozen: GameState = { ...base, effects: { frozen: [{ pieceId: pawn, army: 'b' }], shields: [] } };
    const pairs = legalSwaps(frozen, 'B');
    expect(pairs.some(([a, b]) => a === pawn || b === pawn)).toBe(false);
    expect(pairHas(pairs, king, rook)).toBe(true);
    expect(fail(frozen, 'B', play(six, { type: 'swap', a: pawn, b: king }))).toMatch(/swap/i);
  });
});

describe('7 · Freeze', () => {
  it("a frozen piece can't move on its army's next turn, and can the turn after", () => {
    const seven = num(7);
    const zero = rest();
    const b1 = num(1);
    const b2 = num(1);
    let s = stateFrom('4k3/8/8/3q4/8/8/8/4K3 w - - 0 1', { w: [seven, zero], b: [b1, b2] });
    const queen = idAt(s, 'd5');
    s = ok(s, 'A', play(seven, { type: 'freeze', pieceId: queen }));
    s = ok(s, 'B', { type: 'playCard', cardId: b1.id });
    expect(fail(s, 'B', mv('d5', 'd4'))).toMatch(/frozen/);
    s = ok(s, 'B', mv('e8', 'e7'));
    expect(s.effects.frozen).toEqual([]);
    s = ok(s, 'A', play(zero));
    s = ok(s, 'B', { type: 'playCard', cardId: b2.id });
    s = ok(s, 'B', mv('d5', 'd4'));
    expect(s.chess.board[sq('d4')]).toMatchObject({ type: 'q' });
  });

  it('can target a king', () => {
    const s = stateFrom(START_FEN, { w: [num(7)] });
    expect(legalFreezeTargets(s, 'A')).toHaveLength(16);
  });
});

describe('Skip · Shield', () => {
  const FEN = '3rk3/8/8/8/8/8/3Q4/4K3 w - - 0 1';

  it('a shielded queen cannot be captured until its owner’s next turn starts', () => {
    const shield = card('skip');
    const zeroA = rest();
    const b1 = num(1);
    let s = stateFrom(FEN, { w: [shield, zeroA], b: [b1] });
    s = ok(s, 'A', play(shield, { type: 'shield', pieceId: idAt(s, 'd2') }));
    expect(s.effects.shields).toHaveLength(1);
    s = ok(s, 'B', { type: 'playCard', cardId: b1.id });
    expect(fail(s, 'B', mv('d8', 'd2'))).toMatch(/legal/);
    s = ok(s, 'B', mv('e8', 'e7'));
    expect(s.effects.shields).toEqual([]);
  });

  it('cannot target the king', () => {
    const shield = card('skip');
    const s = stateFrom(FEN, { w: [shield] });
    expect(legalShieldTargets(s, 'A')).toEqual([idAt(s, 'd2')]);
    expect(fail(s, 'A', play(shield, { type: 'shield', pieceId: idAt(s, 'e1') }))).toMatch(/shield/i);
  });

  it('with only a king left, the card resolves with no effect', () => {
    const shield = card('skip');
    const s = stateFrom('4k3/8/8/8/8/8/8/4K3 w - - 0 1', { w: [shield] });
    expect(ok(s, 'A', play(shield)).effects.shields).toEqual([]);
  });
});

describe('9 · Trade Hands', () => {
  it('swaps the hands; the 9 is in neither', () => {
    const nine = num(9);
    const x1 = num(1);
    const x2 = num(2);
    const ys = [num(3), num(4), num(5), num(1)];
    const s = stateFrom(START_FEN, { w: [nine, x1, x2], b: ys });
    const after = ok(s, 'A', play(nine));
    expect(after.hands.B.slice(0, 2).map((c) => c.id)).toEqual([x1.id, x2.id]);
    expect(after.hands.B).toHaveLength(7); // topped up to 7 after the swap
    const mine = after.hands.A.map((c) => c.id);
    for (const y of ys) expect(mine).toContain(y.id);
    expect(mine).not.toContain(nine.id);
    expect(mine).toHaveLength(7);
  });
});

describe('9 · Trade Hands with an empty result', () => {
  it('a player who is left with no cards is topped up to 7 straight away', () => {
    const nine = num(9);
    const s = stateFrom(START_FEN, { w: [nine], b: [num(1), num(2), num(3)] });
    const after = ok(s, 'A', play(nine));
    expect(after.current).toBe('B');
    expect(after.hands.A).toHaveLength(7);
    expect(after.hands.B).toHaveLength(7);
    expect(playableCards(after, 'B')).toHaveLength(7);
  });

  it('even a hand traded down to nothing never leaves the player without a card', () => {
    const nine = num(9);
    const s = stateFrom(START_FEN, { w: [nine], b: [] });
    const after = ok(s, 'A', play(nine));
    expect(after.hands.B.length).toBeGreaterThan(0);
  });
});

describe('Reverse', () => {
  it('B moves next, controlling white; castling rights stay with the armies', () => {
    const rev = card('reverse');
    const b1 = num(1);
    let s = stateFrom(START_FEN, { w: [rev], b: [b1] });
    s = ok(s, 'A', play(rev));
    expect(s.seats).toEqual({ w: 'B', b: 'A' });
    expect(s.current).toBe('B');
    expect(armyOf(s, 'B')).toBe('w');
    expect(s.phase).toEqual({ kind: 'awaitingCard' });
    expect(s.chess.castling.w).toEqual({ k: true, q: true });
    s = ok(s, 'B', { type: 'playCard', cardId: b1.id });
    s = ok(s, 'B', mv('e2', 'e4'));
    expect(s.chess.board[sq('e4')]).toMatchObject({ army: 'w' });
    expect(s.current).toBe('A');
  });
});
