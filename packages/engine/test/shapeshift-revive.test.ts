import { describe, it, expect } from 'vitest';
import {
  START_FEN, apply, legalShapeshifts, legalRevives, playableCards,
  type Action, type EffectArgs, type GameState,
} from '../src/index.js';
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
const idAt = (s: GameState, name: string) => s.chess.board[sq(name)]!.id;
const play = (c: { id: string }, args?: EffectArgs): Action => ({ type: 'playCard', cardId: c.id, ...(args ? { args } : {}) });
const mv = (from: string, to: string): Action => ({ type: 'move', from: sq(from), to: sq(to) });
const shape = (s: GameState, from: string, as: 'n' | 'b' | 'r' | 'q' | 'k' | 'p', to: string, promotion?: 'q' | 'r' | 'b' | 'n'): EffectArgs =>
  ({ type: 'shapeshift', pieceId: idAt(s, from), as, to: sq(to), ...(promotion ? { promotion } : {}) });

describe('8 · Shapeshift', () => {
  it('a boxed-in bishop leaps like a knight (rulebook p.4)', () => {
    const eight = num(8);
    const s = stateFrom(START_FEN, { w: [eight] });
    const after = ok(s, 'A', play(eight, shape(s, 'c1', 'n', 'b3')));
    expect(after.chess.board[sq('b3')]).toMatchObject({ type: 'b' });
    expect(after.chess.board[sq('c1')]).toBeNull();
    expect(after.current).toBe('B');
  });

  it('the piece is itself again on the next turn', () => {
    const eight = num(8);
    const one = num(1);
    const zero = num(0);
    let s = stateFrom(START_FEN, { w: [eight, one], b: [zero] });
    s = ok(s, 'A', play(eight, shape(s, 'c1', 'n', 'b3')));
    s = ok(s, 'B', play(zero));
    s = ok(s, 'A', { type: 'playCard', cardId: one.id });
    expect(fail(s, 'A', mv('b3', 'd4'))).toMatch(/legal/);
    s = ok(s, 'A', mv('b3', 'd5'));
    expect(s.chess.board[sq('d5')]).toMatchObject({ type: 'b' });
  });

  it('cannot borrow its own type, and is refused without arguments', () => {
    const eight = num(8);
    const s = stateFrom(START_FEN, { w: [eight] });
    expect(legalShapeshifts(s, 'A').some((o) => o.pieceId === idAt(s, 'b1') && o.as === 'n')).toBe(false);
    expect(fail(s, 'A', play(eight))).toMatch(/piece/i);
  });

  it('a pawn moving as a knight onto the last rank promotes', () => {
    const eight = num(8);
    const s = stateFrom('7k/8/1P6/8/8/8/8/7K w - - 0 1', { w: [eight] });
    expect(fail(s, 'A', play(eight, shape(s, 'b6', 'n', 'a8')))).toBe('Choose a promotion piece');
    const after = ok(s, 'A', play(eight, shape(s, 'b6', 'n', 'a8', 'q')));
    expect(after.chess.board[sq('a8')]).toMatchObject({ type: 'q', army: 'w' });
  });

  it('a knight moving as a pawn onto the last rank stays a knight', () => {
    const eight = num(8);
    const s = stateFrom('8/1N6/8/8/8/8/8/k6K w - - 0 1', { w: [eight] });
    const after = ok(s, 'A', play(eight, shape(s, 'b7', 'p', 'b8')));
    expect(after.chess.board[sq('b8')]).toMatchObject({ type: 'n' });
  });

  it('a shapeshift whose landing square checks (as its real type) is reported', () => {
    const eight = num(8);
    const s = stateFrom('8/3k4/8/8/8/8/8/1N2K3 w - - 0 1', { w: [eight] });
    const r = apply(s, 'A', play(eight, shape(s, 'b1', 'r', 'b8')));
    if (!r.ok) throw new Error(r.error);
    expect(r.events.map((e) => e.text)).toContain('Check!');
    expect(r.state.phase).toEqual({ kind: 'awaitingCard' });
  });

  it('cannot capture a shielded piece', () => {
    const eight = num(8);
    const base = stateFrom('4k3/8/8/3q4/8/8/3B4/4K3 w - - 0 1', { w: [eight] });
    const queen = idAt(base, 'd5');
    expect(legalShapeshifts(base, 'A').some((o) => o.as === 'r' && o.to === sq('d5'))).toBe(true);
    const shielded: GameState = { ...base, effects: { frozen: [], shields: [{ pieceId: queen, owner: 'B' }] } };
    expect(legalShapeshifts(shielded, 'A').some((o) => o.to === sq('d5'))).toBe(false);
  });

  it('a shapeshift that escapes check is playable as an effect in check', () => {
    const eight = num(8);
    const s = stateFrom('4r1k1/8/8/8/8/8/1N6/4K3 w - - 0 1', { w: [eight] });
    expect(playableCards(s, 'A')[0]).toMatchObject({ asEffect: true });
    const after = ok(s, 'A', play(eight, shape(s, 'b2', 'r', 'e2')));
    expect(after.chess.board[sq('e2')]).toMatchObject({ type: 'n' });
    expect(after.current).toBe('B');
  });
});

describe('Wild · Revive', () => {
  it('legal squares are empty and in the first two rows, excluding squares that give check (rulebook p.4)', () => {
    const s = stateFrom('2k5/8/8/8/8/8/8/4K3 w - - 0 1', { w: [card('wild')] }, { captured: { w: ['q'], r: [], b: [] } });
    const squares = legalRevives(s, 'A').map((o) => o.square);
    expect(squares).not.toContain(sq('c1'));
    expect(squares).not.toContain(sq('c2'));
    expect(squares).toContain(sq('b1'));
    expect(squares).toContain(sq('d1'));
    expect(squares.every((x) => x < 16)).toBe(true);
    expect(squares).not.toContain(sq('e1'));
  });

  it('a captured pawn may return as a queen; a captured knight returns as a knight only', () => {
    const wild = card('wild');
    const s = stateFrom('4k3/8/8/8/8/8/8/4K3 w - - 0 1', { w: [wild] }, { captured: { w: ['p', 'n'], r: [], b: [] } });
    const options = legalRevives(s, 'A');
    expect(options.some((o) => o.capturedIndex === 0 && o.asQueen)).toBe(true);
    expect(options.some((o) => o.capturedIndex === 0 && !o.asQueen)).toBe(true);
    expect(options.filter((o) => o.capturedIndex === 1).every((o) => !o.asQueen)).toBe(true);
    const after = ok(s, 'A', play(wild, { type: 'revive', capturedIndex: 0, square: sq('d2'), asQueen: true }));
    expect(after.chess.board[sq('d2')]).toMatchObject({ type: 'q', army: 'w' });
    expect(after.captured.w).toEqual(['n']);
  });

  it('revives a black piece into black’s first two rows', () => {
    const wild = card('wild');
    const s = stateFrom('4k3/8/8/8/8/8/8/4K3 b - - 0 1', { b: [wild] }, { captured: { w: [], r: [], b: ['r'] } });
    expect(legalRevives(s, 'B').every((o) => o.square >= 48)).toBe(true);
  });

  it('with nothing captured the card resolves with no effect', () => {
    const wild = card('wild');
    const s = stateFrom(START_FEN, { w: [wild] });
    const after = ok(s, 'A', play(wild));
    expect(after.chess).toEqual(s.chess);
    expect(after.current).toBe('B');
  });

  it('a revive that blocks check is playable as an effect in check', () => {
    const wild = card('wild');
    const s = stateFrom('4r1k1/8/8/8/8/8/8/4K3 w - - 0 1', { w: [wild] }, { captured: { w: ['r'], r: [], b: [] } });
    expect(playableCards(s, 'A')[0]).toMatchObject({ asEffect: true });
    expect(legalRevives(s, 'A')).toEqual([{ capturedIndex: 0, square: sq('e2'), asQueen: false }]);
    expect(fail(s, 'A', play(wild, { type: 'revive', capturedIndex: 0, square: sq('a2') }))).toMatch(/revived/);
  });
});
