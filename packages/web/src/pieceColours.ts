import { PIECE_COLOURS, type Army, type PieceColour, type PieceType } from '@isachess/engine';

export { PIECE_COLOURS };

export const COLOUR_HEX: Record<PieceColour, string> = {
  red: '#e5484d',
  orange: '#f5923e',
  yellow: '#f2c94c',
  green: '#3fae6a',
  blue: '#3b82e6',
  indigo: '#4b4fc4',
  violet: '#9b5de5',
  black: '#1c1c1f',
  white: '#ffffff',
};

export const DEFAULT_COLOURS: Record<Army, PieceColour> = { w: 'white', r: 'red', b: 'black' };

/** The SVG for a piece: the classic sets for white and black, the tinted sets for every other colour. */
export function pieceSrc(army: Army, type: PieceType, colour?: PieceColour): string {
  const t = type.toUpperCase();
  if (!colour) return `/pieces/${army}${t}.svg`;
  if (colour === 'white') return `/pieces/w${t}.svg`;
  if (colour === 'black') return `/pieces/b${t}.svg`;
  return `/pieces/${colour}/${t}.svg`;
}
