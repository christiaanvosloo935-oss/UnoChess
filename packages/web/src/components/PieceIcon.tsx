import type { Army, PieceType } from '@unochess/engine';
import { PIECE_NAME } from './pieceNames';

/** Piece artwork: the "Cburnett" SVG set (see README for the licence). */
export function PieceIcon({ army, type, className = '' }: { army: Army; type: PieceType; className?: string }) {
  return (
    <img
      className={`piece-img ${className}`.trim()}
      src={`/pieces/${army}${type.toUpperCase()}.svg`}
      alt={`${army === 'w' ? 'white' : 'black'} ${PIECE_NAME[type].toLowerCase()}`}
      draggable={false}
    />
  );
}
