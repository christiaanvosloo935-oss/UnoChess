import {
  fromFen,
  type Army,
  type Card,
  type CardKind,
  type Castling,
  type ChessState,
  type GameState,
  type Piece,
  type PieceType,
  type Square,
} from '../src/index.js';

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
    captured: { w: [], r: [], b: [] },
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

/** Three-player square: `hsq('w', 'e2')` is section w, file e, rank 2 (= 0*32 + 1*8 + 4). */
export const hsq = (army: Army, name: string): Square =>
  'wrb'.indexOf(army) * 32 + (Number(name[1]) - 1) * 8 + (name.charCodeAt(0) - 97);

/**
 * A three-player ChessState from `[army, type, 'w.e1']` triples (section, dot, square in that
 * section). Castling rights are all off unless given.
 */
export function hexChess(
  pieces: [Army, PieceType, string][],
  rights: Partial<Castling> = {},
): ChessState {
  const board: (Piece | null)[] = new Array(96).fill(null);
  const counters: Record<string, number> = {};
  for (const [army, type, where] of pieces) {
    const key = army + type;
    const n = counters[key] ?? 0;
    counters[key] = n + 1;
    board[hsq(where[0] as Army, where.slice(2))] = { id: `${key}${n}`, type, army };
  }
  const off = () => ({ k: false, q: false });
  return {
    variant: 'three',
    board,
    castling: { w: rights.w ?? off(), r: rights.r ?? off(), b: rights.b ?? off() },
    ep: null,
  };
}
