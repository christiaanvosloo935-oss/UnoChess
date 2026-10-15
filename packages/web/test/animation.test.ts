import { describe, it, expect } from 'vitest';
import { apply, START_FEN, type Action, type GameState } from '@isachess/engine';
import { diffBoards, newEffects, shouldAnimate } from '../src/animation';
import { card, num, sq, stateFrom } from '../../engine/test/helpers';

function ok(state: GameState, player: string, action: Action): GameState {
  const r = apply(state, player, action);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}
const mv = (from: string, to: string, promotion?: 'q'): Action => ({ type: 'move', from: sq(from), to: sq(to), ...(promotion ? { promotion } : {}) });
const play = (c: { id: string }, args?: Extract<Action, { type: 'playCard' }>['args']): Action => ({ type: 'playCard', cardId: c.id, ...(args ? { args } : {}) });
const idAt = (s: GameState, n: string) => s.chess.board[sq(n)]!.id;

/** Plays one 1-move card from `fen` for white and returns the boards before and after. */
function oneMove(fen: string, action: Action) {
  const c = num(1);
  const before = stateFrom(fen, { w: [c] });
  const after = ok(ok(before, 'A', play(c)), 'A', action);
  return { before, after, diff: diffBoards(before.chess.board, after.chess.board) };
}

describe('diffBoards', () => {
  it('a normal move is one slide', () => {
    const { before, diff } = oneMove(START_FEN, mv('e2', 'e4'));
    expect(diff.moves).toEqual([{ id: idAt(before, 'e2'), from: sq('e2'), to: sq('e4'), hop: false }]);
    expect(diff.captured).toEqual([]);
    expect(diff.appeared).toEqual([]);
    expect(diff.promoted).toEqual([]);
  });

  it('a knight jump hops', () => {
    expect(oneMove(START_FEN, mv('g1', 'f3')).diff.moves[0].hop).toBe(true);
  });

  it('a bishop borrowing the knight move also hops (Shapeshift)', () => {
    const eight = num(8);
    const before = stateFrom(START_FEN, { w: [eight] });
    const after = ok(before, 'A', play(eight, { type: 'shapeshift', pieceId: idAt(before, 'c1'), as: 'n', to: sq('b3') }));
    const diff = diffBoards(before.chess.board, after.chess.board);
    expect(diff.moves).toEqual([{ id: idAt(before, 'c1'), from: sq('c1'), to: sq('b3'), hop: true }]);
  });

  it('a capture slides the capturer and reports the captured piece where it stood', () => {
    const { before, diff } = oneMove('4k3/8/8/3p4/4P3/8/8/4K3 w - - 0 1', mv('e4', 'd5'));
    expect(diff.moves).toHaveLength(1);
    expect(diff.captured).toEqual([{ piece: before.chess.board[sq('d5')], square: sq('d5') }]);
  });

  it('en passant reports the captured pawn on its own square, not the landing square', () => {
    const { before, diff } = oneMove('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1', mv('e5', 'd6'));
    expect(diff.captured).toEqual([{ piece: before.chess.board[sq('d5')], square: sq('d5') }]);
    expect(diff.moves[0]).toMatchObject({ from: sq('e5'), to: sq('d6') });
  });

  it('castling slides the king and the rook', () => {
    const c = num(1);
    const before = stateFrom('4k3/8/8/8/8/8/8/4K2R w K - 0 1', { w: [c] });
    const after = ok(ok(before, 'A', play(c)), 'A', mv('e1', 'g1'));
    const moves = diffBoards(before.chess.board, after.chess.board).moves;
    expect(moves.map((m) => [m.from, m.to]).sort()).toEqual([[sq('e1'), sq('g1')], [sq('h1'), sq('f1')]].sort());
  });

  it('a swap slides both pieces across each other', () => {
    const six = num(6);
    const before = stateFrom('6k1/8/8/8/8/8/PPPP4/R3K3 w Q - 0 1', { w: [six] });
    const after = ok(before, 'A', play(six, { type: 'swap', a: idAt(before, 'a1'), b: idAt(before, 'e1') }));
    const moves = diffBoards(before.chess.board, after.chess.board).moves;
    expect(moves).toHaveLength(2);
    expect(moves.map((m) => [m.from, m.to]).sort()).toEqual([[sq('a1'), sq('e1')], [sq('e1'), sq('a1')]].sort());
  });

  it('a revived piece appears in place', () => {
    const wild = card('wild');
    const before = stateFrom('4k3/8/8/8/8/8/8/4K3 w - - 0 1', { w: [wild] }, { captured: { w: ['n'], r: [], b: [] } });
    const after = ok(before, 'A', play(wild, { type: 'revive', capturedIndex: 0, square: sq('b1') }));
    const diff = diffBoards(before.chess.board, after.chess.board);
    expect(diff.appeared).toEqual([{ id: after.chess.board[sq('b1')]!.id, square: sq('b1') }]);
    expect(diff.moves).toEqual([]);
  });

  it('a promotion slides the pawn and then marks it promoted', () => {
    const { before, diff } = oneMove('4k3/P7/8/8/8/8/8/4K3 w - - 0 1', mv('a7', 'a8', 'q'));
    expect(diff.moves).toEqual([{ id: idAt(before, 'a7'), from: sq('a7'), to: sq('a8'), hop: false }]);
    expect(diff.promoted).toEqual([{ id: idAt(before, 'a7'), square: sq('a8') }]);
  });

  it('identical boards produce an empty diff', () => {
    const s = stateFrom(START_FEN);
    expect(diffBoards(s.chess.board, s.chess.board)).toEqual({ moves: [], captured: [], appeared: [], promoted: [] });
  });
});

describe('newEffects', () => {
  it('lists only the pieces that just became frozen or shielded', () => {
    const none = { frozen: [], shields: [], pendingSkip: null };
    const next = { frozen: [{ pieceId: 'bq0', army: 'b' as const }], shields: [{ pieceId: 'wr0', owner: 'A' }], pendingSkip: null };
    expect(newEffects(none, next)).toEqual({ frozen: ['bq0'], shielded: ['wr0'] });
    expect(newEffects(next, next)).toEqual({ frozen: [], shielded: [] });
  });
});

describe('shouldAnimate', () => {
  it('animates normal progress but not the first state, a flip, or a restarted game', () => {
    expect(shouldAnimate(null, { army: 'w', turn: 1 })).toBe(false);
    expect(shouldAnimate({ army: 'w', turn: 3 }, { army: 'w', turn: 4 })).toBe(true);
    expect(shouldAnimate({ army: 'w', turn: 3 }, { army: 'w', turn: 3 })).toBe(true);
    expect(shouldAnimate({ army: 'w', turn: 3 }, { army: 'b', turn: 4 })).toBe(false);
    expect(shouldAnimate({ army: 'w', turn: 9 }, { army: 'w', turn: 1 })).toBe(false);
  });
});
