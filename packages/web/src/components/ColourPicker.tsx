import type { PieceColour } from '@isachess/engine';
import { COLOUR_HEX, PIECE_COLOURS } from '../pieceColours';

interface Props {
  value: PieceColour;
  onChange: (colour: PieceColour) => void;
  taken?: PieceColour[]; // already used by the other players
}

export function ColourPicker({ value, onChange, taken }: Props) {
  return (
    <div className="colour-field">
      <span>Your piece colour</span>
      <div className="colour-picker" role="radiogroup" aria-label="Your piece colour">
        {PIECE_COLOURS.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={value === c}
            aria-label={c}
            title={taken?.includes(c) ? `${c} (already taken)` : c}
            disabled={taken?.includes(c)}
            className={`swatch${value === c ? ' chosen' : ''}`}
            style={{ background: COLOUR_HEX[c] }}
            onClick={() => onChange(c)}
            data-testid={`colour-${c}`}
          />
        ))}
      </div>
    </div>
  );
}
