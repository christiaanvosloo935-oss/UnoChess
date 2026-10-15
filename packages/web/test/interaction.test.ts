import { describe, it, expect } from 'vitest';
import { apply, viewFor, START_FEN, type Action, type GameState, type PlayerView } from '@isachess/engine';
import { highlights, prompt, step, type Selection } from '../src/interaction';
import { card, hexState, num, sq, stateFrom } from '../../engine/test/helpers';

const IDLE: Selection = { kind: 'idle' };
const viewA = (s: GameState): PlayerView => viewFor(s, 'A');
const idAt = (s: GameState, name: string) => s.chess.board[sq(name)]!.id;
function ok(state: GameState, action: Action): GameState {
  const r = apply(state, 'A', action);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}

describe('card clicks', () => {
  it('clicking a move card sends playCard', () => {
    const c = num(3);
    const r = step(viewA(stateFrom(START_FEN, { w: [c] })), IDLE, { type: 'clickCard', cardId: c.id, asOne: false });
    expect(r.send).toEqual({ type: 'playCard', cardId: c.id });
    expect(r.sel).toEqual(IDLE);
  });

  it('an effect card with empty options sends playCard without args', () => {
    const c = card('skip');
    const v = viewA(stateFrom('4k3/8/8/8/8/8/8/4K3 w - - 0 1', { w: [c] }));
    expect(step(v, IDLE, { type: 'clickCard', cardId: c.id, asOne: false }).send).toEqual({ type: 'playCard', cardId: c.id });
  });

  it('ignores cards that are not playable and clicks when it is not your turn', () => {
    const c = num(1);
    const s = stateFrom(START_FEN, { w: [c], b: [num(1)] });
    expect(step(viewFor(s, 'B'), IDLE, { type: 'clickCard', cardId: s.hands.B[0].id, asOne: false }).send).toBeUndefined();
    expect(step(viewA(s), IDLE, { type: 'clickCard', cardId: 'nope', asOne: false }).send).toBeUndefined();
  });

  it('in check, a no-move card is only playable as a 1', () => {
    const c = num(0);
    const v = viewA(stateFrom('4r1k1/8/8/8/8/8/8/4K3 w - - 0 1', { w: [c] }));
    expect(step(v, IDLE, { type: 'clickCard', cardId: c.id, asOne: false }).send).toBeUndefined();
    expect(step(v, IDLE, { type: 'clickCard', cardId: c.id, asOne: true }).send).toEqual({ type: 'playCard', cardId: c.id, asOne: true });
  });

  it('cancel returns to idle, and clicking the chosen card again cancels', () => {
    const c = num(7);
    const v = viewA(stateFrom(START_FEN, { w: [c] }));
    const chosen = step(v, IDLE, { type: 'clickCard', cardId: c.id, asOne: false }).sel;
    expect(chosen.kind).toBe('cardChosen');
    expect(step(v, chosen, { type: 'cancel' }).sel).toEqual(IDLE);
    expect(step(v, chosen, { type: 'clickCard', cardId: c.id, asOne: false }).sel).toEqual(IDLE);
  });
});

describe('targeted cards', () => {
  it('swap needs two picks, then sends args', () => {
    const c = num(6);
    const s = stateFrom('4k3/8/8/8/8/8/PP6/R3K3 w Q - 0 1', { w: [c] });
    const v = viewA(s);
    let r = step(v, IDLE, { type: 'clickCard', cardId: c.id, asOne: false });
    expect(r.send).toBeUndefined();
    r = step(v, r.sel, { type: 'clickSquare', sq: sq('a1') });
    expect(r.send).toBeUndefined();
    expect(prompt(v, r.sel)).toMatch(/second/i);
    r = step(v, r.sel, { type: 'clickSquare', sq: sq('a2') });
    expect(r.send).toMatchObject({ type: 'playCard', cardId: c.id, args: { type: 'swap', a: idAt(s, 'a1'), b: idAt(s, 'a2') } });
  });

  it('freeze: one click on an enemy piece sends args', () => {
    const c = num(7);
    const s = stateFrom(START_FEN, { w: [c] });
    const v = viewA(s);
    let r = step(v, IDLE, { type: 'clickCard', cardId: c.id, asOne: false });
    expect(step(v, r.sel, { type: 'clickSquare', sq: sq('e2') }).send).toBeUndefined();
    r = step(v, r.sel, { type: 'clickSquare', sq: sq('d8') });
    expect(r.send).toEqual({ type: 'playCard', cardId: c.id, args: { type: 'freeze', pieceId: idAt(s, 'd8') } });
  });

  it('shield cannot be put on the king', () => {
    const c = card('skip');
    const s = stateFrom(START_FEN, { w: [c] });
    const v = viewA(s);
    let r = step(v, IDLE, { type: 'clickCard', cardId: c.id, asOne: false });
    expect(step(v, r.sel, { type: 'clickSquare', sq: sq('e1') }).send).toBeUndefined();
    r = step(v, r.sel, { type: 'clickSquare', sq: sq('e2') });
    expect(r.send).toMatchObject({ args: { type: 'shield', pieceId: idAt(s, 'e2') } });
  });

  it('shapeshift flow: piece, then type, then square', () => {
    const c = num(8);
    const s = stateFrom(START_FEN, { w: [c] });
    const v = viewA(s);
    let r = step(v, IDLE, { type: 'clickCard', cardId: c.id, asOne: false });
    r = step(v, r.sel, { type: 'clickSquare', sq: sq('c1') });
    expect(r.send).toBeUndefined();
    expect(step(v, r.sel, { type: 'chooseType', as: 'q' }).sel).toEqual(r.sel);
    r = step(v, r.sel, { type: 'chooseType', as: 'n' });
    expect(highlights(v, r.sel).targets.sort((a, b) => a - b)).toEqual([sq('b3'), sq('d3')]);
    r = step(v, r.sel, { type: 'clickSquare', sq: sq('b3') });
    expect(r.send).toEqual({
      type: 'playCard', cardId: c.id,
      args: { type: 'shapeshift', pieceId: idAt(s, 'c1'), as: 'n', to: sq('b3') },
    });
  });

  it('shapeshift onto the last rank asks for a promotion piece', () => {
    const c = num(8);
    const s = stateFrom('7k/8/1P6/8/8/8/8/7K w - - 0 1', { w: [c] });
    const v = viewA(s);
    let r = step(v, IDLE, { type: 'clickCard', cardId: c.id, asOne: false });
    r = step(v, r.sel, { type: 'clickSquare', sq: sq('b6') });
    r = step(v, r.sel, { type: 'chooseType', as: 'n' });
    r = step(v, r.sel, { type: 'clickSquare', sq: sq('a8') });
    expect(r.send).toBeUndefined();
    expect(r.needPromotion).toEqual({ from: sq('b6'), to: sq('a8') });
    r = step(v, r.sel, { type: 'choosePromotion', p: 'q' });
    expect(r.send).toMatchObject({ args: { type: 'shapeshift', as: 'n', to: sq('a8'), promotion: 'q' } });
  });

  it('revive flow with a pawn returning as a queen', () => {
    const c = card('wild');
    const s = stateFrom('4k3/8/8/8/8/8/8/4K3 w - - 0 1', { w: [c] }, { captured: { w: ['p'], r: [], b: [] } });
    const v = viewA(s);
    let r = step(v, IDLE, { type: 'clickCard', cardId: c.id, asOne: false });
    expect(highlights(v, r.sel).targets).toEqual([]);
    r = step(v, r.sel, { type: 'chooseCaptured', index: 0, asQueen: true });
    expect(highlights(v, r.sel).targets).toContain(sq('d2'));
    r = step(v, r.sel, { type: 'clickSquare', sq: sq('d2') });
    expect(r.send).toEqual({
      type: 'playCard', cardId: c.id,
      args: { type: 'revive', capturedIndex: 0, square: sq('d2'), asQueen: true },
    });
  });
});

describe('moving phase', () => {
  const movingView = (fen: string, c = num(1)) => {
    const s = ok(stateFrom(fen, { w: [c] }), { type: 'playCard', cardId: c.id });
    return viewA(s);
  };

  it('piece then target sends a move', () => {
    const v = movingView(START_FEN);
    expect(highlights(v, IDLE).selectable).toContain(sq('e2'));
    let r = step(v, IDLE, { type: 'clickSquare', sq: sq('e2') });
    expect(highlights(v, r.sel).targets.sort((a, b) => a - b)).toEqual([sq('e3'), sq('e4')]);
    r = step(v, r.sel, { type: 'clickSquare', sq: sq('e4') });
    expect(r.send).toEqual({ type: 'move', from: sq('e2'), to: sq('e4') });
  });

  it('can switch to another piece, and clicking an empty square does nothing', () => {
    const v = movingView(START_FEN);
    let r = step(v, IDLE, { type: 'clickSquare', sq: sq('e2') });
    r = step(v, r.sel, { type: 'clickSquare', sq: sq('d2') });
    expect(r.sel).toEqual({ kind: 'pieceChosen', from: sq('d2') });
    expect(step(v, IDLE, { type: 'clickSquare', sq: sq('e5') }).send).toBeUndefined();
  });

  it('a promotion target asks needPromotion, then sends the chosen piece', () => {
    const v = movingView('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    let r = step(v, IDLE, { type: 'clickSquare', sq: sq('a7') });
    r = step(v, r.sel, { type: 'clickSquare', sq: sq('a8') });
    expect(r.send).toBeUndefined();
    expect(r.needPromotion).toEqual({ from: sq('a7'), to: sq('a8') });
    r = step(v, r.sel, { type: 'choosePromotion', p: 'n' });
    expect(r.send).toEqual({ type: 'move', from: sq('a7'), to: sq('a8'), promotion: 'n' });
  });
});

describe('targeted cards (three players)', () => {
  const three = (hand: ReturnType<typeof card>[]) => hexState({
    pieces: [['w', 'k', 'w.e1'], ['r', 'k', 'r.e1'], ['b', 'k', 'b.e1']],
    hands: { A: hand },
  });
  const click = (v: PlayerView, c: { id: string }) => step(v, IDLE, { type: 'clickCard', cardId: c.id, asOne: false });

  it('a targeted card with one opponent sends playCard without a target', () => {
    const c = card('draw2');
    const s = three([c]);
    s.eliminated = ['C'];
    const v = viewFor(s, 'A');
    expect(v.options.targets).toEqual(['B']);
    const r = click(v, c);
    expect(r.send).toEqual({ type: 'playCard', cardId: c.id });
    expect(r.sel).toEqual(IDLE);
  });

  it('with two opponents clicking the card selects it and the prompt asks which opponent', () => {
    const c = card('wild4');
    const v = viewFor(three([c]), 'A');
    const r = click(v, c);
    expect(r.send).toBeUndefined();
    expect(r.sel).toMatchObject({ kind: 'cardChosen', cardId: c.id });
    expect(prompt(v, r.sel)).toBe('Choose which opponent');
    expect(highlights(v, r.sel)).toEqual({ selectable: [], targets: [] });
  });

  it('chooseTarget sends playCard with the target and returns to idle', () => {
    const c = num(9);
    const v = viewFor(three([c]), 'A');
    const picked = click(v, c).sel;
    const r = step(v, picked, { type: 'chooseTarget', playerId: 'C' });
    expect(r.send).toEqual({ type: 'playCard', cardId: c.id, target: 'C' });
    expect(r.sel).toEqual(IDLE);
  });

  it('chooseTarget for a player not in options.targets is ignored', () => {
    const c = card('reverse');
    const v = viewFor(three([c]), 'A');
    const picked = click(v, c).sel;
    for (const playerId of ['A', 'Z']) {
      const r = step(v, picked, { type: 'chooseTarget', playerId });
      expect(r.send).toBeUndefined();
      expect(r.sel).toEqual(picked);
    }
  });
});
