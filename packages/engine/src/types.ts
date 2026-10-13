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
