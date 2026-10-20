import { fromFen, type Card, type CardKind, type GameState } from '../src/index.js';

let counter = 0;
export function card(kind: CardKind, value?: number): Card {
  const c: Card = { id: `t${counter++}`, kind, colour: kind === 'wild' || kind === 'wild4' ? null : 'red' };
  if (value !== undefined) c.value = value;
  return c;
}
export const num = (v: number) => card('num', v);

export function stateFrom(
  fen: string,
  hands: { w?: Card[]; b?: Card[] } = {},
  opts: Partial<GameState> = {},
): GameState {
  const { chess, toMove } = fromFen(fen);
  const filler = (id: string): Card => ({ id, kind: 'num', colour: 'red', value: 0 });
  const state: GameState = {
    chess,
    captured: { w: [], b: [] },
    players: ['A', 'B'],
    seats: { w: 'A', b: 'B' },
    hands: { A: hands.w ?? [num(0)], B: hands.b ?? [num(0)] },
    drawPile: Array.from({ length: 20 }, (_, i) => filler(`d${i}`)),
    discardPile: [],
    seed: 1,
    current: toMove === 'w' ? 'A' : 'B',
    turn: 1,
    phase: { kind: 'awaitingCard' },
    effects: { frozen: [], shields: [], pendingSkip: null },
    nextPieceId: 0,
    log: [],
  };
  return { ...state, ...opts };
}

export const sq = (name: string) => (Number(name[1]) - 1) * 8 + (name.charCodeAt(0) - 97);

/** A card that does nothing when played: a Revive with nothing captured. */
export const rest = () => card('wild');
