import { describe, it, expect } from 'vitest';
import { fromFen, toFen, START_FEN } from '../src/index.js';

const KIWIPETE = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';

describe('fen', () => {
  it('roundtrips START_FEN and Kiwipete', () => {
    for (const fen of [START_FEN, KIWIPETE]) {
      const { chess, toMove } = fromFen(fen);
      expect(toFen(chess, toMove)).toBe(fen);
    }
  });

  it('reads the start position', () => {
    const { chess, toMove } = fromFen(START_FEN);
    expect(toMove).toBe('w');
    expect(chess.board[4]).toMatchObject({ type: 'k', army: 'w' });
    expect(chess.board[60]).toMatchObject({ type: 'k', army: 'b' });
    expect(chess.castling).toEqual({ w: { k: true, q: true }, r: { k: false, q: false }, b: { k: true, q: true } });
    expect(chess.ep).toBeNull();
  });

  it('gives every piece a unique id', () => {
    const { chess } = fromFen(START_FEN);
    const ids = chess.board.filter(Boolean).map((p) => p!.id);
    expect(ids).toHaveLength(32);
    expect(new Set(ids).size).toBe(32);
  });

  it('reads an en passant square', () => {
    const { chess } = fromFen('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
    expect(chess.ep).toEqual({ square: 43, victim: 35, capturer: 'w', setOnTurn: 0 });
  });
});
