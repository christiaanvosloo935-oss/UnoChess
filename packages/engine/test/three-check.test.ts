import { describe, expect, it } from 'vitest';
import { apply, isInCheck, legalRevives, legalSwaps, type Action, type Army, type GameState, type PieceType } from '../src/index.js';
import { card, hexState, hsq, num } from './helpers.js';

type Pieces = [Army, PieceType, string][];
const play = (c: { id: string }, extra: Partial<Extract<Action, { type: 'playCard' }>> = {}): Action =>
  ({ type: 'playCard', cardId: c.id, ...extra });
function ok(s: GameState, p: string, a: Action): GameState {
  const r = apply(s, p, a);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}
const texts = (s: GameState) => s.log.map((e) => e.text);

// Red is already in check from the black rook; white (A, to move) is not.
const REPRO: Pieces = [['w', 'k', 'w.e1'], ['w', 'p', 'w.a2'], ['r', 'k', 'r.e1'], ['b', 'r', 'r.e3'], ['b', 'k', 'b.a1']];

describe('check that persists from a third player is not given by the mover', () => {
  it('a movement card is not cut short and logs no Check!', () => {
    const three = num(3);
    const s0 = hexState({ pieces: REPRO, hands: { A: [three] } });
    expect(isInCheck(s0.chess, 'r')).toBe(true);
    expect(isInCheck(s0.chess, 'w')).toBe(false);
    let s = ok(s0, 'A', play(three));
    s = ok(s, 'A', { type: 'move', from: hsq('w', 'a2'), to: hsq('w', 'a3') });
    expect(s.phase).toMatchObject({ kind: 'moving', movesLeft: 2 });
    expect(texts(s)).not.toContain('Check!');
    expect(s.current).toBe('A');
  });
  it('a shapeshift logs no Check!', () => {
    const eight = num(8);
    const s0 = hexState({ pieces: REPRO, hands: { A: [eight] } });
    const opt = { type: 'shapeshift' as const, pieceId: s0.chess.board[hsq('w', 'a2')]!.id, as: 'r' as const, to: hsq('w', 'a3') };
    const s = ok(s0, 'A', play(eight, { args: opt } as never));
    expect(texts(s)).not.toContain('Check!');
  });
  it('swaps and revives remain available', () => {
    const noRook = REPRO.filter((p) => p[1] !== 'r');
    const withRook = hexState({ pieces: REPRO, captured: { w: ['p', 'n'] } });
    const without = hexState({ pieces: noRook, captured: { w: ['p', 'n'] } });
    expect(legalSwaps(withRook, 'A').length).toBe(1);
    expect(legalSwaps(withRook, 'A')).toEqual(legalSwaps(without, 'A'));
    expect(legalRevives(withRook, 'A').length).toBeGreaterThan(0);
    // revives that would newly check red are refused only when red was not already in check
    const key = (o: { capturedIndex: number; square: number; asQueen: boolean }) => `${o.capturedIndex}/${o.square}/${o.asQueen}`;
    const got = legalRevives(withRook, 'A').map(key);
    for (const o of legalRevives(without, 'A')) expect(got).toContain(key(o));
  });
});

describe('check newly given still counts', () => {
  it('a move that newly checks an enemy ends the card and logs Check!', () => {
    const three = num(3);
    const s0 = hexState({
      pieces: [['w', 'k', 'w.e1'], ['w', 'r', 'w.a2'], ['r', 'k', 'r.e1'], ['b', 'k', 'b.a1']],
      hands: { A: [three] },
    });
    let s = ok(s0, 'A', play(three));
    s = ok(s, 'A', { type: 'move', from: hsq('w', 'a2'), to: hsq('w', 'd2') });
    expect(texts(s)).toContain('Check!');
    expect(s.phase).toEqual({ kind: 'awaitingCard' });
    expect(s.current).toBe('B');
  });
  it('a newly given check ends the card even while another enemy was already in check', () => {
    const three = num(3);
    // red is in check from the black rook; white's rook then checks black's king
    const s0 = hexState({
      pieces: [['w', 'k', 'w.e1'], ['w', 'r', 'w.a2'], ['r', 'k', 'r.e1'], ['b', 'r', 'r.e3'], ['b', 'k', 'w.d4']],
      hands: { A: [three] },
    });
    expect(isInCheck(s0.chess, 'b')).toBe(false);
    let s = ok(s0, 'A', play(three));
    s = ok(s, 'A', { type: 'move', from: hsq('w', 'a2'), to: hsq('w', 'd2') });
    expect(isInCheck(s.chess, 'b')).toBe(true);
    expect(texts(s)).toContain('Check!');
    expect(s.phase).toEqual({ kind: 'awaitingCard' });
  });
  it('a discovered check created by the mover counts as given', () => {
    const three = num(3);
    // white rook r.e4 is blocked from red's king by a white knight on r.e3; the knight moves away
    const s0 = hexState({
      pieces: [['w', 'k', 'w.e1'], ['w', 'r', 'r.e4'], ['w', 'n', 'r.e3'], ['r', 'k', 'r.e1'], ['b', 'k', 'b.a1']],
      hands: { A: [three] },
    });
    expect(isInCheck(s0.chess, 'r')).toBe(false);
    let s = ok(s0, 'A', play(three));
    s = ok(s, 'A', { type: 'move', from: hsq('r', 'e3'), to: hsq('r', 'c4') });
    expect(isInCheck(s.chess, 'r')).toBe(true);
    expect(texts(s)).toContain('Check!');
    expect(s.phase).toEqual({ kind: 'awaitingCard' });
  });
  it('a shapeshift that newly checks logs Check!', () => {
    const eight = num(8);
    const s1 = hexState({
      pieces: [['w', 'k', 'w.e1'], ['w', 'r', 'r.a2'], ['r', 'k', 'r.e1'], ['b', 'k', 'b.a1']],
      hands: { A: [eight] },
    });
    const t = ok(s1, 'A', play(eight, { args: { type: 'shapeshift', pieceId: s1.chess.board[hsq('r', 'a2')]!.id, as: 'k', to: hsq('r', 'a1') } } as never));
    expect(isInCheck(t.chess, 'r')).toBe(true);
    expect(texts(t)).toContain('Check!');
  });
  it('a swap that newly gives check is refused, but the same swap is fine when that army was already in check', () => {
    const quiet: Pieces = [['w', 'k', 'w.e1'], ['w', 'r', 'w.a1'], ['w', 'n', 'r.a1'], ['r', 'k', 'r.e1'], ['b', 'k', 'b.a1']];
    const s = hexState({ pieces: quiet });
    const rook = s.chess.board[hsq('w', 'a1')]!.id;
    const knight = s.chess.board[hsq('r', 'a1')]!.id;
    const has = (st: GameState) => legalSwaps(st, 'A').some(([x, y]) => [x, y].includes(rook) && [x, y].includes(knight));
    expect(has(s)).toBe(false);
    // the rook would now check red along rank 1, but black's rook already did
    const already = hexState({ pieces: [...quiet.slice(0, 4), ['b', 'r', 'r.e3'], ['b', 'k', 'b.a1']] });
    expect(isInCheck(already.chess, 'r')).toBe(true);
    expect(has(already)).toBe(true);
  });
  it('a revive that newly gives check is refused', () => {
    const s = hexState({
      pieces: [['w', 'k', 'w.e1'], ['r', 'k', 'r.e1'], ['b', 'k', 'w.a4']],
      captured: { w: ['r'] },
    });
    const squares = legalRevives(s, 'A').map((o) => o.square);
    expect(squares).not.toContain(hsq('w', 'a1'));
    expect(squares).not.toContain(hsq('w', 'a2'));
    expect(squares).toContain(hsq('w', 'b1'));
  });
});

describe('log lines name the target', () => {
  it('Trade Hands and Reverse name the other army', () => {
    const nine = card('num', 9);
    const rev = card('reverse');
    const s = hexState({ pieces: REPRO, hands: { A: [nine, rev] } });
    const t = ok(s, 'A', play(nine, { target: 'C' }));
    expect(texts(t)).toContain('traded hands with Black');
    const r = ok(s, 'A', play(rev, { target: 'B' }));
    expect(texts(r)).toContain('switched sides with Red');
  });
});
