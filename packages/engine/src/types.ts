export type Army = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type PromotionType = 'q' | 'r' | 'b' | 'n';
export type Square = number;
export type PlayerId = string;

export interface Piece {
  id: string;
  type: PieceType;
  army: Army;
}

export interface Castling {
  w: { k: boolean; q: boolean };
  b: { k: boolean; q: boolean };
}

export interface EnPassant {
  square: Square;
  capturer: Army;
  setOnTurn: number;
}

export interface ChessState {
  board: (Piece | null)[];
  castling: Castling;
  ep: EnPassant | null;
}

export interface Move {
  from: Square;
  to: Square;
  promotion?: PromotionType;
  castle?: 'k' | 'q';
  enPassant?: boolean;
  as?: PieceType;
}

export type Colour = 'red' | 'yellow' | 'green' | 'blue';
export type CardKind = 'num' | 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild4';
export interface Card {
  id: string;
  kind: CardKind;
  colour: Colour | null;
  value?: number; // 0-9, only for 'num'
}

export type Phase =
  | { kind: 'awaitingCard' }
  | { kind: 'moving'; cardId: string; movesLeft: number; moved: string[]; mustMove: boolean }
  | { kind: 'over'; winner: PlayerId | null; reason: 'checkmate' | 'stalemate' | 'resign' };

export interface Effects {
  frozen: { pieceId: string; army: Army }[];
  shields: { pieceId: string; owner: PlayerId }[];
  pendingSkip: PlayerId | null;
}

export interface GameEvent {
  turn: number;
  player: PlayerId;
  text: string; // public text only
}

/** The card most recently played, kept even after the discard pile is reshuffled. */
export interface LastPlayed {
  player: PlayerId;
  card: Card;
  asOne: boolean;
}

export interface GameState {
  chess: ChessState;
  captured: { w: PieceType[]; b: PieceType[] }; // pieces OF that army that were captured
  players: [PlayerId, PlayerId]; // [initial white, initial black]
  seats: { w: PlayerId; b: PlayerId };
  hands: Record<PlayerId, Card[]>;
  drawPile: Card[];
  discardPile: Card[];
  seed: number;
  current: PlayerId;
  turn: number;
  phase: Phase;
  effects: Effects;
  nextPieceId: number;
  log: GameEvent[];
  lastPlayed?: LastPlayed;
}

export type EffectArgs =
  | { type: 'swap'; a: string; b: string }
  | { type: 'freeze'; pieceId: string }
  | { type: 'shield'; pieceId: string }
  | { type: 'shapeshift'; pieceId: string; as: PieceType; to: Square; promotion?: PromotionType }
  | { type: 'revive'; capturedIndex: number; square: Square; asQueen?: boolean };

export type Action =
  | { type: 'playCard'; cardId: string; asOne?: boolean; args?: EffectArgs }
  | { type: 'move'; from: Square; to: Square; promotion?: PromotionType }
  | { type: 'doneMoving' }
  | { type: 'resign' };

export type ApplyResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  | { ok: false; error: string };
