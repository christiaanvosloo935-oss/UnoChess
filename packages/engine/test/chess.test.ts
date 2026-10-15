import { describe, it, expect } from 'vitest';
import {
  fromFen, START_FEN, legalMoves, movesAs, isInCheck, applyChessMove, findKing,
  type Army, type ChessState,
} from '../src/index.js';

const KIWIPETE = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
const POS3 = '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1';

function perft(chess: ChessState, army: Army, depth: number): number {
  if (depth === 0) return 1;
  const next: Army = army === 'w' ? 'b' : 'w';
  let total = 0;
  for (const m of legalMoves(chess, army)) {
    const { chess: after } = applyChessMove(chess, m, 1);
    total += depth === 1 ? 1 : perft(after, next, depth - 1);
  }
  return total;
}

const sqOf = (name: string) => (Number(name[1]) - 1) * 8 + (name.charCodeAt(0) - 97);

describe('perft', () => {
  it('start position', () => {
    const { chess, toMove } = fromFen(START_FEN);
    expect([1, 2, 3].map((d) => perft(chess, toMove, d))).toEqual([20, 400, 8902]);
  });
  it('Kiwipete', () => {
    const { chess, toMove } = fromFen(KIWIPETE);
    expect([1, 2].map((d) => perft(chess, toMove, d))).toEqual([48, 2039]);
  });
  it('position 3', () => {
    const { chess, toMove } = fromFen(POS3);
    expect([1, 2, 3].map((d) => perft(chess, toMove, d))).toEqual([14, 191, 2812]);
  });
});

describe('effect context', () => {
  it('frozen piece has no moves', () => {
    const { chess } = fromFen(START_FEN);
    const e2 = chess.board[12]!.id;
    expect(legalMoves(chess, 'w', { frozen: new Set([e2]) })).toHaveLength(18);
  });

  it('shielded piece cannot be captured', () => {
    const { chess } = fromFen('4k3/8/8/3q4/8/8/8/3QK3 w - - 0 1');
    const d5 = sqOf('d5');
    expect(legalMoves(chess, 'w').some((m) => m.to === d5)).toBe(true);
    const shield = new Set([chess.board[d5]!.id]);
    expect(legalMoves(chess, 'w', { shielded: shield }).some((m) => m.to === d5)).toBe(false);
  });

  it('shielded attacker still gives check', () => {
    const { chess } = fromFen('4k3/8/8/8/8/8/4r3/4K3 w - - 0 1');
    const e2 = sqOf('e2');
    const shield = new Set([chess.board[e2]!.id]);
    expect(isInCheck(chess, 'w')).toBe(true);
    expect(legalMoves(chess, 'w', { shielded: shield }).some((m) => m.to === e2)).toBe(false);
    expect(legalMoves(chess, 'w').some((m) => m.to === e2)).toBe(true);
  });

  it('moved set blocks re-moving and castling', () => {
    const { chess } = fromFen('4k3/8/8/8/8/8/8/4K2R w K - 0 1');
    const rook = chess.board[7]!.id;
    expect(legalMoves(chess, 'w').some((m) => m.castle === 'k')).toBe(true);
    const moved = new Set([rook]);
    expect(legalMoves(chess, 'w', { moved }).some((m) => m.castle === 'k')).toBe(false);
    expect(legalMoves(chess, 'w', { moved }).some((m) => m.from === 7)).toBe(false);
  });

  it('cannot castle through an attacked square', () => {
    const { chess } = fromFen('4k3/8/8/8/8/5r2/8/4K2R w K - 0 1');
    expect(legalMoves(chess, 'w').some((m) => m.castle)).toBe(false);
  });

  it('en passant only inside its turn window', () => {
    const { chess } = fromFen('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
    const d6 = sqOf('d6');
    expect(legalMoves(chess, 'w', { turn: 1 }).some((m) => m.enPassant && m.to === d6)).toBe(true);
    expect(legalMoves(chess, 'w', { turn: 2 }).some((m) => m.enPassant)).toBe(false);
  });

  it('a pawn double step sets the en passant square for the opponent', () => {
    const { chess } = fromFen(START_FEN);
    const { chess: after } = applyChessMove(chess, { from: sqOf('e2'), to: sqOf('e4') }, 5);
    expect(after.ep).toEqual({ square: sqOf('e3'), victim: sqOf('e4'), capturer: 'b', setOnTurn: 5 });
  });
});

describe('movesAs (shapeshift)', () => {
  it('boxed-in bishop leaps as knight', () => {
    const { chess } = fromFen(START_FEN);
    const tos = movesAs(chess, sqOf('c1'), 'n').map((m) => m.to).sort((a, b) => a - b);
    expect(tos).toEqual([sqOf('b3'), sqOf('d3')]);
  });

  it('pawn reaching last rank promotes even when moving as a knight', () => {
    const { chess } = fromFen('7k/8/1P6/8/8/8/8/7K w - - 0 1');
    const ms = movesAs(chess, sqOf('b6'), 'n');
    for (const t of ['a8', 'c8']) {
      expect(ms.filter((m) => m.to === sqOf(t) && m.promotion)).toHaveLength(4);
    }
    for (const t of ['d7', 'd5', 'a4', 'c4']) {
      expect(ms.filter((m) => m.to === sqOf(t))).toHaveLength(1);
      expect(ms.find((m) => m.to === sqOf(t))!.promotion).toBeUndefined();
    }
    expect(ms).toHaveLength(12);
  });

  it('knight moving as pawn onto last rank does not promote', () => {
    const { chess } = fromFen('8/1N6/8/8/8/8/8/k6K w - - 0 1');
    const ms = movesAs(chess, sqOf('b7'), 'p');
    expect(ms).toHaveLength(1);
    expect(ms[0]).toMatchObject({ to: sqOf('b8') });
    expect(ms[0].promotion).toBeUndefined();
  });

  it('never castles', () => {
    const { chess } = fromFen('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1');
    for (const as of ['r', 'k', 'q'] as const) {
      expect(movesAs(chess, sqOf('e1'), as).some((m) => m.castle)).toBe(false);
    }
  });

  it('never sets en passant', () => {
    const { chess } = fromFen('4k3/8/8/8/8/8/N7/4K3 w - - 0 1');
    const m = movesAs(chess, sqOf('a2'), 'p').find((x) => x.to === sqOf('a4'))!;
    expect(m).toBeDefined();
    expect(applyChessMove(chess, m, 3).chess.ep).toBeNull();
  });

  it('is filtered for self-check', () => {
    const { chess } = fromFen('4r1k1/8/8/8/8/8/4B3/4K3 w - - 0 1');
    expect(movesAs(chess, sqOf('e2'), 'n').length).toBe(0);
    expect(findKing(chess, 'w')).toBe(sqOf('e1'));
  });
});
