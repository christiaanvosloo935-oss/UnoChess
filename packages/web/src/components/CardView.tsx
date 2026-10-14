import type { Card } from '@isachess/engine';

export function cardSymbol(card: Card): string {
  switch (card.kind) {
    case 'num': return String(card.value);
    case 'skip': return '⊘';
    case 'reverse': return '⇄';
    case 'draw2': return '+2';
    case 'wild': return 'R';
    case 'wild4': return '+4';
  }
}

/** A heater-style shield, drawn in the card's text colour with a lighter inner edge. */
export function ShieldIcon() {
  return (
    <svg className="shield-icon" data-testid="shield-icon" viewBox="0 0 24 26" aria-label="Shield" role="img">
      <path d="M12 1.5 21 4.8v7.4c0 5.6-3.7 9.6-9 12-5.3-2.4-9-6.4-9-12V4.8z" fill="currentColor" />
      <path d="M12 4.6 18.4 7v5.2c0 4-2.5 7-6.4 9-3.9-2-6.4-5-6.4-9V7z" fill="none" stroke="rgba(0,0,0,0.28)" strokeWidth="1.4" />
      <path d="M12 4.6v16.6" stroke="rgba(0,0,0,0.2)" strokeWidth="1.2" />
    </svg>
  );
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
      <span className="corner">{card.kind === 'skip' ? <ShieldIcon /> : (label ?? cardSymbol(card))}</span>
      <span className={`face${card.kind !== 'skip' && (label ?? cardSymbol(card)).length > 2 ? ' wide' : ''}`}>
        {card.kind === 'skip' ? <ShieldIcon /> : (label ?? cardSymbol(card))}
      </span>
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
