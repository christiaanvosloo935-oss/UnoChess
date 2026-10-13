import type { PieceType } from '@unochess/engine';

// The solid glyph set for both armies; colour comes from CSS. U+FE0E keeps the pawn from turning into an emoji.
export const GLYPH: Record<PieceType, string> = {
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟︎',
};
export const PIECE_NAME: Record<PieceType, string> = {
  k: 'King', q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight', p: 'Pawn',
};
