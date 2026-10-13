import type { Card } from '@unochess/engine';

export function cardSymbol(card: Card): string {
  switch (card.kind) {
    case 'num': return String(card.value);
    case 'skip': return '⊘';
    case 'reverse': return '⇄';
    case 'draw2': return '+2';
    case 'wild': return 'W';
    case 'wild4': return '+4';
  }
}

export function cardName(card: Card): string {
  switch (card.kind) {
    case 'num': {
      const v = card.value!;
      if (v === 0) return 'Rest';
      if (v <= 5) return v === 1 ? '1 move' : `${v} moves`;
      return ['', '', '', '', '', '', 'Swap', 'Freeze', 'Shapeshift', 'Trade hands'][v];
    }
    case 'skip': return 'Shield';
    case 'reverse': return 'Switch sides';
    case 'draw2': return 'Draw two';
    case 'wild': return 'Revive';
    case 'wild4': return 'Draw four';
  }
}

interface Props {
  card: Card;
  onClick?: () => void;
  disabled?: boolean;
  selected?: boolean;
  asOne?: boolean;
  small?: boolean;
  label?: string; // overrides the big symbol (used by the card guide)
  caption?: string;
}

export function CardView({ card, onClick, disabled, selected, asOne, small, label, caption }: Props) {
  const colour = card.colour ?? 'wild';
  return (
    <button
      type="button"
      className={`card card-${colour}${selected ? ' selected' : ''}${small ? ' small' : ''}`}
      disabled={disabled}
      onClick={onClick}
      data-testid={`card-${card.id}`}
      title={asOne ? `${cardName(card)} (play as a 1 move)` : cardName(card)}
    >
      <span className="corner">{label ?? cardSymbol(card)}</span>
      <span className={`oval${(label ?? cardSymbol(card)).length > 2 ? ' wide' : ''}`}>{label ?? cardSymbol(card)}</span>
      <span className="caption">{asOne ? 'as 1 move' : (caption ?? cardName(card))}</span>
    </button>
  );
}

export function CardBack({ count }: { count: number }) {
  return (
    <div className="card-back" aria-label={`${count} cards`}>
      <span>{count}</span>
    </div>
  );
}
