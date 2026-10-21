import { describe, it, expect } from 'vitest';
import { apply, START_FEN, type Action, type GameState } from '../src/index.js';
import { card, hexState, num, stateFrom, rest } from './helpers.js';

const play = (c: { id: string }): Action => ({ type: 'playCard', cardId: c.id });
function ok(s: GameState, player: string, a: Action): GameState {
  const r = apply(s, player, a);
  if (!r.ok) throw new Error(r.error);
  return r.state;
}
const zeros = (n: number) => Array.from({ length: n }, () => rest());
const K: Parameters<typeof hexState>[0]['pieces'] = [['w', 'k', 'w.e1'], ['r', 'k', 'r.e1'], ['b', 'k', 'b.e1']];

describe('+2 and +4 give the cards to the player who plays them', () => {
  it('+2: the player draws 2, the opponent is untouched and the turn passes on', () => {
    const d2 = card('draw2');
    const s = stateFrom(START_FEN, { w: [d2, ...zeros(6)], b: zeros(7) });
    const after = ok(s, 'A', play(d2));
    expect(after.hands.A).toHaveLength(8); // 7 - the +2, then 2 drawn
    expect(after.hands.B).toHaveLength(7);
    expect(after.current).toBe('B'); // nobody is skipped
    expect(after.phase).toEqual({ kind: 'awaitingCard' });
  });

  it('+4: the player draws 4', () => {
    const w4 = card('wild4');
    const s = stateFrom(START_FEN, { w: [w4, ...zeros(6)], b: zeros(7) });
    const after = ok(s, 'A', play(w4));
    expect(after.hands.A).toHaveLength(10);
    expect(after.hands.B).toHaveLength(7);
    expect(after.current).toBe('B');
  });

  it('the player plays down to 7 and is then topped up again as normal', () => {
    const w4 = card('wild4');
    let s = stateFrom(START_FEN, { w: [w4, ...zeros(6)], b: zeros(9) });
    s = ok(s, 'A', play(w4));
    const sizes: number[] = [];
    for (let i = 0; i < 4; i++) {
      s = ok(s, 'B', play(s.hands.B[0]));
      s = ok(s, 'A', play(s.hands.A[0]));
      sizes.push(s.hands.A.length);
    }
    expect(sizes).toEqual([9, 8, 7, 7]);
  });

  it('with three players there is no opponent to choose and the next player in turn moves', () => {
    const d2 = card('draw2');
    const s = hexState({ pieces: K, hands: { A: [d2, ...zeros(6)], B: zeros(7), C: zeros(7) } });
    const after = ok(s, 'A', play(d2)); // no target needed
    expect(after.hands.A).toHaveLength(8);
    expect(after.hands.B).toHaveLength(7);
    expect(after.hands.C).toHaveLength(7);
    expect(after.current).toBe('B');
    const next = ok(after, 'B', play(after.hands.B[0]));
    expect(next.current).toBe('C');
  });

  it('when the piles run dry the player draws what exists', () => {
    const w4 = card('wild4');
    const s = stateFrom(START_FEN, { w: [w4, ...zeros(6)] }, { drawPile: zeros(1), discardPile: [] });
    const after = ok(s, 'A', play(w4));
    expect(after.hands.A).toHaveLength(7); // 6 left + the single card that exists
    expect(after.current).toBe('B');
  });

  it('nothing in the game state can skip a turn any more', () => {
    const s = stateFrom(START_FEN);
    expect('pendingSkips' in s.effects).toBe(false);
  });
});
