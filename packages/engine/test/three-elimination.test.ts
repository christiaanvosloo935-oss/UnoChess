import { describe, expect, it } from 'vitest';
import {
  apply, isInCheck, legalFreezeTargets, legalMoves,
  type Action, type Army, type GameState, type PieceType,
} from '../src/index.js';
import { card, hexState, num } from './helpers.js';

type Pieces = [Army, PieceType, string][];

// Red (B) is mated on r.a1 by a white rook ladder; white (A) and black (C) kings are safe.
const REDMATE: Pieces = [
  ['w', 'k', 'w.e1'], ['b', 'k', 'b.e1'],
  ['r', 'k', 'r.a1'], ['w', 'r', 'r.h1'], ['w', 'r', 'r.h2'],
];
// Red (B) is stalemated on r.a1 by a white queen; white (A) and black (C) kings are safe.
const REDSTALE: Pieces = [
  ['w', 'k', 'w.e1'], ['b', 'k', 'b.e1'],
  ['r', 'k', 'r.a1'], ['w', 'q', 'r.c2'],
];

const play = (c: { id: string }, extra: Partial<Extract<Action, { type: 'playCard' }>> = {}): Action =>
  ({ type: 'playCard', cardId: c.id, ...extra });
function ok(s: GameState, p: string, a: Action): GameState {
  const r = apply(s, p, a);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}
/** A plays a 0 card, so B's turn starts. */
function aPassesTo(pieces: Pieces, extra: Partial<GameState> = {}, bHand = [num(3), num(4)]): GameState {
  const zero = num(0);
  const base = hexState({ pieces, hands: { A: [zero, num(1)], B: bHand } });
  return ok({ ...base, ...extra }, 'A', play(zero));
}

describe('test positions', () => {
  it('the mate and the stalemate are what they claim', () => {
    const mate = hexState({ pieces: REDMATE });
    expect(isInCheck(mate.chess, 'r')).toBe(true);
    expect(legalMoves(mate.chess, 'r')).toEqual([]);
    expect(isInCheck(mate.chess, 'w')).toBe(false);
    expect(isInCheck(mate.chess, 'b')).toBe(false);
    const stale = hexState({ pieces: REDSTALE });
    expect(isInCheck(stale.chess, 'r')).toBe(false);
    expect(legalMoves(stale.chess, 'r')).toEqual([]);
    expect(isInCheck(stale.chess, 'w')).toBe(false);
    expect(isInCheck(stale.chess, 'b')).toBe(false);
  });
});

describe('elimination', () => {
  it('a player who starts their turn checkmated is eliminated', () => {
    const bHand = [num(3), num(4)];
    const s = aPassesTo(REDMATE, {}, bHand);
    expect(s.eliminated).toEqual(['B']);
    expect(s.hands.B).toEqual([]);
    for (const c of bHand) expect(s.discardPile.map((d) => d.id)).toContain(c.id);
    expect(s.chess.board.filter((p) => p?.army === 'r')).toHaveLength(1);
    expect(s.chess.board.filter((p) => p?.army === 'w' && p.type === 'r')).toHaveLength(2);
    expect(s.current).toBe('C');
    expect(s.phase).toEqual({ kind: 'awaitingCard' });
    expect(s.log.some((e) => e.player === 'B' && e.text === 'is checkmated')).toBe(true);
  });

  it('clears the eliminated player\'s frozen pieces and shields', () => {
    const base = hexState({ pieces: REDMATE, hands: { A: [num(0), num(1)], B: [num(3)] } });
    const withEffects: GameState = {
      ...base,
      effects: {
        frozen: [{ pieceId: 'rk0', army: 'r' }, { pieceId: 'bk0', army: 'b' }],
        shields: [{ pieceId: 'rk0', owner: 'B' }],
        pendingSkips: [],
      },
    };
    const s = ok(withEffects, 'A', play(withEffects.hands.A[0]));
    expect(s.eliminated).toEqual(['B']);
    expect(s.effects.frozen).toEqual([{ pieceId: 'bk0', army: 'b' }]);
    expect(s.effects.shields).toEqual([]);
  });

  it('the last remaining player wins', () => {
    const s = aPassesTo(REDMATE, { eliminated: ['C'] });
    expect(s.eliminated.sort()).toEqual(['B', 'C']);
    expect(s.phase).toEqual({ kind: 'over', winner: 'A', reason: 'checkmate' });
  });

  it('eliminated players cannot act', () => {
    const s = { ...aPassesTo(REDMATE), current: 'C' };
    expect(apply(s, 'B', { type: 'resign' })).toEqual({ ok: false, error: 'You have been eliminated.' });
    expect(apply(s, 'B', play(num(3)))).toEqual({ ok: false, error: 'You have been eliminated.' });
    expect(apply(s, 'B', { type: 'doneMoving' }).ok).toBe(false);
  });

  it('an eliminated army\'s pieces still give check to a live king', () => {
    const s = hexState({
      pieces: [['w', 'k', 'w.a1'], ['r', 'r', 'w.h1'], ['r', 'k', 'r.e1'], ['b', 'k', 'b.e1']],
    });
    const dead = { ...s, eliminated: ['B'] };
    expect(isInCheck(dead.chess, 'w')).toBe(true);
    // the live white king still has to escape it
    expect(legalMoves(dead.chess, 'w').every((m) => m.from === 0)).toBe(true);
    expect(legalMoves(dead.chess, 'w').some((m) => m.to === 1)).toBe(false);
  });

  it('freeze targets exclude an eliminated army', () => {
    const s = hexState({ pieces: [...REDMATE, ['b', 'p', 'b.a2']] });
    expect(legalFreezeTargets(s, 'A').sort()).toEqual(['bk0', 'bp0', 'rk0'].sort());
    const dead = { ...s, eliminated: ['B'] };
    expect(legalFreezeTargets(dead, 'A').sort()).toEqual(['bk0', 'bp0']);
  });

  it('a dead king in check does not end the living players\' cards', () => {
    // red is dead and mated; white's single move with a 2 must not stop after one move
    const zero = num(2);
    const base = hexState({ pieces: [...REDMATE, ['w', 'p', 'w.a2']], hands: { A: [zero] }, current: 'A' });
    const s = ok({ ...base, eliminated: ['B'] }, 'A', play(zero));
    expect(s.phase).toMatchObject({ kind: 'moving', movesLeft: 2 });
    const m = ok(s, 'A', { type: 'move', from: 8, to: 16 });
    expect(m.phase).toMatchObject({ kind: 'moving', movesLeft: 1 });
  });
});

describe('stalemate', () => {
  it('with three in skips the turn', () => {
    const bHand = Array.from({ length: 7 }, () => num(3)); // a full hand: the skipped turn draws nothing
    const s = aPassesTo(REDSTALE, {}, bHand);
    expect(s.eliminated).toEqual([]);
    expect(s.current).toBe('C');
    expect(s.phase).toEqual({ kind: 'awaitingCard' });
    expect(s.hands.B).toEqual(bHand); // no card, no draw
    expect(s.log.some((e) => e.player === 'B' && e.text === 'is stalemated')).toBe(true);
  });

  it('with two left is a draw', () => {
    const s = aPassesTo(REDSTALE, { eliminated: ['C'] });
    expect(s.phase).toEqual({ kind: 'over', winner: null, reason: 'stalemate' });
  });

  it('every active player stalemated ends in a draw, without looping', () => {
    const zero = num(0);
    const pieces: Pieces = [
      ['w', 'k', 'w.b1'], ['r', 'k', 'r.b1'], ['b', 'k', 'b.b1'],
      ['w', 'b', 'b.a1'], ['r', 'b', 'w.a1'], ['b', 'b', 'r.a1'],
      ['w', 'p', 'b.b3'], ['r', 'p', 'w.b3'], ['b', 'p', 'r.b3'],
      ['w', 'p', 'b.b2'], ['r', 'p', 'w.b2'], ['b', 'p', 'r.b2'],
    ];
    const s0 = hexState({ pieces, hands: { A: [zero] } });
    for (const army of ['w', 'r', 'b'] as const) {
      expect(isInCheck(s0.chess, army)).toBe(false);
      expect(legalMoves(s0.chess, army)).toEqual([]);
    }
    const s = ok(s0, 'A', play(zero));
    expect(s.phase).toEqual({ kind: 'over', winner: null, reason: 'stalemate' });
    expect(s.eliminated).toEqual([]);
  });

  it('a stalemated player\'s turn returns once a move exists', () => {
    const zero = num(0);
    let s = aPassesTo(REDSTALE, {}, [num(3)]);
    // white (A) takes the queen away from the red king
    s = { ...s, chess: { ...s.chess, board: s.chess.board.map((p) => (p?.id === 'wq0' ? null : p)) } };
    s = ok({ ...s, hands: { ...s.hands, C: [zero] } }, 'C', play(zero));
    expect(s.current).toBe('A');
    const another = num(0);
    s = ok({ ...s, hands: { ...s.hands, A: [another] } }, 'A', play(another));
    expect(s.current).toBe('B');
    expect(s.phase).toEqual({ kind: 'awaitingCard' });
  });
});

describe('resignation', () => {
  it('out of turn eliminates only that player', () => {
    const hand = [num(3), num(4)];
    const base = hexState({ pieces: REDMATE.slice(0, 2).concat([['r', 'k', 'r.e1']]), hands: { C: hand }, current: 'A' });
    const s = ok(base, 'C', { type: 'resign' });
    expect(s.eliminated).toEqual(['C']);
    expect(s.hands.C).toEqual([]);
    expect(s.discardPile.map((c) => c.id)).toEqual(hand.map((c) => c.id));
    expect(s.current).toBe('A');
    expect(s.phase).toEqual({ kind: 'awaitingCard' });
    expect(s.log[s.log.length - 1]).toMatchObject({ player: 'C', text: 'resigned' });
    const next = ok(s, 'A', play(s.hands.A[0]));
    expect(next.current).toBe('B');
    expect(ok(next, 'B', play(next.hands.B[0])).current).toBe('A');
  });

  it('on your own turn mid-card passes the turn on with a fresh phase', () => {
    const two = num(2);
    const base = hexState({
      pieces: [['w', 'k', 'w.e1'], ['b', 'k', 'b.e1'], ['r', 'k', 'r.e1']],
      hands: { A: [two] },
    });
    let s = ok(base, 'A', play(two));
    expect(s.phase.kind).toBe('moving');
    s = ok(s, 'A', { type: 'resign' });
    expect(s.eliminated).toEqual(['A']);
    expect(s.current).toBe('B');
    expect(s.phase).toEqual({ kind: 'awaitingCard' });
  });

  it('leaving one player ends the game', () => {
    const base = hexState({ pieces: [['w', 'k', 'w.e1'], ['b', 'k', 'b.e1'], ['r', 'k', 'r.e1']] });
    const s = ok({ ...base, eliminated: ['C'] }, 'B', { type: 'resign' });
    expect(s.phase).toEqual({ kind: 'over', winner: 'A', reason: 'resign' });
  });

  it('resigning clears the resigner\'s shields and frozen pieces but keeps others', () => {
    const base = hexState({ pieces: [['w', 'k', 'w.e1'], ['b', 'k', 'b.e1'], ['r', 'k', 'r.e1'], ['r', 'p', 'r.a2']] });
    const s = ok({
      ...base,
      effects: {
        frozen: [{ pieceId: 'rp0', army: 'r' }, { pieceId: 'bk0', army: 'b' }],
        shields: [{ pieceId: 'rp0', owner: 'B' }, { pieceId: 'wk0', owner: 'A' }],
        pendingSkips: [],
      },
    }, 'B', { type: 'resign' });
    expect(s.effects.frozen).toEqual([{ pieceId: 'bk0', army: 'b' }]);
    expect(s.effects.shields).toEqual([{ pieceId: 'wk0', owner: 'A' }]);
  });

  it('resigning clears a pending skip', () => {
    const base = hexState({ pieces: [['w', 'k', 'w.e1'], ['b', 'k', 'b.e1'], ['r', 'k', 'r.e1']] });
    const s = ok({ ...base, effects: { ...base.effects, pendingSkips: ['C'] } }, 'C', { type: 'resign' });
    expect(s.effects.pendingSkips).toEqual([]);
  });
});
