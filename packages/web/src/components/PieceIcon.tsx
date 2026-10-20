import type { Army, PieceColour, PieceType } from '@isachess/engine';
import { pieceSrc } from '../pieceColours';
import { PIECE_NAME } from './pieceNames';

interface Props {
  army: Army;
  type: PieceType;
  colour?: PieceColour; // the owner's chosen colour; defaults to the army's own
  className?: string;
  pieceId?: string;
}

/** Piece artwork: the "Cburnett" SVG set (see README for the licence), tinted to the owner's colour. */
export function PieceIcon({ army, type, colour, className = '', pieceId }: Props) {
  return (
    <img
      className={`piece-img ${className}`.trim()}
      src={pieceSrc(army, type, colour)}
      alt={`${colour ?? (army === 'w' ? 'white' : 'black')} ${PIECE_NAME[type].toLowerCase()}`}
      draggable={false}
      data-piece-id={pieceId}
    />
  );
}
