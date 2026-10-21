import { describe, expect, it } from 'vitest';
import { applyChessMove, isInCheck, legalMoves, startChess, type Army, type Move } from '../src/index.js';
import { hexChess, hsq } from './helpers.js';

const at = (where: string) => hsq(where[0] as Army, where.slice(2));
const tos = (moves: Move[]) => moves.map((m) => m.to).sort((a, b) => a - b);

describe('chess rules on the three-player board', () => {
  it('start position: each army has 20 legal moves', () => {
    const chess = startChess('three');
    for (const army of ['w', 'r', 'b'] as const) expect(legalMoves(chess, army)).toHaveLength(20);
    expect(chess.castling.r).toEqual({ k: true, q: true });
  });

  it('a bishop on w.a1 with all squares free reaches b.a1, b.h1 and r.a1 through the centre', () => {
    const chess = hexChess([['w', 'b', 'w.a1']]);
    const reach = legalMoves(chess, 'w').map((m) => m.to);
    for (const t of ['w.d4', 'b.d4', 'b.e4', 'r.d4', 'b.a1', 'b.h1', 'r.a1']) expect(reach).toContain(at(t));
  });

  it('check can come from either opponent, and from two at once', () => {
    const chess = hexChess([
      ['w', 'k', 'w.e1'],
      ['w', 'r', 'w.h2'],
      ['r', 'r', 'w.e4'],
      ['b', 'r', 'w.a1'],
    ]);
    expect(isInCheck(chess, 'w')).toBe(true);
    const moves = legalMoves(chess, 'w');
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every((m) => m.from === at('w.e1'))).toBe(true);
    const to = tos(moves);
    for (const bad of ['w.d1', 'w.f1', 'w.e2']) expect(to).not.toContain(at(bad));
    expect(to).toContain(at('w.d2'));
    expect(isInCheck(hexChess([['w', 'k', 'w.e1'], ['r', 'r', 'w.e4']]), 'w')).toBe(true);
    expect(isInCheck(hexChess([['w', 'k', 'w.e1'], ['b', 'r', 'w.a1']]), 'w')).toBe(true);
  });

  it('ladder mate across the section', () => {
    const chess = hexChess([
      ['w', 'k', 'w.a1'],
      ['r', 'r', 'w.h1'],
      ['r', 'r', 'w.h2'],
    ]);
    expect(isInCheck(chess, 'w')).toBe(true);
    expect(legalMoves(chess, 'w')).toEqual([]);
  });

  it('stalemate pattern', () => {
    const chess = hexChess([
      ['w', 'k', 'w.a1'],
      ['r', 'q', 'w.c2'],
      ['r', 'k', 'r.e1'],
    ]);
    expect(isInCheck(chess, 'w')).toBe(false);
    expect(legalMoves(chess, 'w')).toEqual([]);
  });

  it('a pawn crossing the seam', () => {
    const push = hexChess([['w', 'k', 'w.e1'], ['w', 'p', 'w.c4']]);
    const pm = legalMoves(push, 'w').filter((m) => m.from === at('w.c4'));
    expect(pm.map((m) => m.to)).toEqual([at('r.f4')]);

    const promo = hexChess([['w', 'k', 'w.e1'], ['w', 'p', 'r.b2']]);
    const mm = legalMoves(promo, 'w').filter((m) => m.from === at('r.b2'));
    expect(mm).toHaveLength(4);
    expect(mm.every((m) => m.to === at('r.b1'))).toBe(true);
    expect(mm.map((m) => m.promotion).sort()).toEqual(['b', 'n', 'q', 'r']);
  });

  it('rosette pawn captures three ways', () => {
    const chess = hexChess([
      ['w', 'k', 'w.a1'],
      ['w', 'p', 'w.d4'],
      ['b', 'n', 'b.d4'],
      ['b', 'n', 'b.e4'],
      ['r', 'n', 'r.d4'],
      ['r', 'k', 'r.a1'],
    ]);
    const caps = legalMoves(chess, 'w').filter((m) => m.from === at('w.d4') && chess.board[m.to]);
    expect(tos(caps)).toEqual(tos(['b.d4', 'b.e4', 'r.d4'].map((t) => ({ from: 0, to: at(t) }))));
  });

  it('castling', () => {
    const rights = { r: { k: true, q: true } };
    const chess = hexChess([['r', 'k', 'r.e1'], ['r', 'r', 'r.h1'], ['r', 'r', 'r.a1']], rights);
    const moves = legalMoves(chess, 'r');
    expect(moves.find((m) => m.castle === 'k')).toMatchObject({ from: at('r.e1'), to: at('r.g1') });
    expect(moves.find((m) => m.castle === 'q')).toMatchObject({ to: at('r.c1') });

    const done = applyChessMove(chess, moves.find((m) => m.castle === 'k')!, 1).chess;
    expect(done.board[at('r.f1')]).toMatchObject({ type: 'r', army: 'r' });
    expect(done.board[at('r.h1')]).toBeNull();

    const stepped = applyChessMove(chess, { from: at('r.e1'), to: at('r.e2') }, 1).chess;
    expect(stepped.castling.r).toEqual({ k: false, q: false });

    const attacked = hexChess(
      [['r', 'k', 'r.e1'], ['r', 'r', 'r.h1'], ['b', 'r', 'r.f4']],
      rights,
    );
    expect(legalMoves(attacked, 'r').some((m) => m.castle === 'k')).toBe(false);
  });

  it('en passant only for the next mover', () => {
    const chess = hexChess([
      ['w', 'p', 'w.c2'],
      ['r', 'p', 'w.d4'],
      ['b', 'p', 'w.b4'],
    ]);
    const { chess: after } = applyChessMove(chess, { from: at('w.c2'), to: at('w.c4') }, 1, 'r');
    const ep = legalMoves(after, 'r', { turn: 2 }).find((m) => m.enPassant);
    expect(ep).toMatchObject({ from: at('w.d4'), to: at('w.c3') });
    expect(applyChessMove(after, ep!, 2).chess.board[at('w.c4')]).toBeNull();
    expect(legalMoves(after, 'b', { turn: 2 }).some((m) => m.to === at('w.c3'))).toBe(false);
    expect(legalMoves(after, 'r', { turn: 3 }).some((m) => m.enPassant)).toBe(false);
  });

  it('dead pieces still block and attack', () => {
    const gives = hexChess([['w', 'k', 'w.a1'], ['b', 'r', 'w.h1']]);
    expect(isInCheck(gives, 'w')).toBe(true);
    const blocked = hexChess([['w', 'k', 'w.a1'], ['b', 'b', 'w.d1'], ['r', 'r', 'w.h1']]);
    expect(isInCheck(blocked, 'w')).toBe(false);
  });
});
