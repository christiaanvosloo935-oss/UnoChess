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

/** Two pieces trading places. */
export function SwapIcon() {
  return (
    <svg className="card-icon" data-testid="icon-swap" viewBox="0 0 24 24" aria-label="Swap" role="img">
      <circle cx="5.5" cy="12" r="3.6" fill="currentColor" />
      <circle cx="18.5" cy="12" r="3.6" fill="currentColor" />
      <path d="M6 7.2C8.5 3.2 15.5 3.2 18 7.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M15.6 6.2 18.2 7.6 19 4.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M18 16.8C15.5 20.8 8.5 20.8 6 16.8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M8.4 17.8 5.8 16.4 5 19.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** A snowflake: the piece is frozen in place. */
export function FreezeIcon() {
  return (
    <svg className="card-icon" data-testid="icon-freeze" viewBox="0 0 24 24" aria-label="Freeze" role="img" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {[0, 60, 120, 180, 240, 300].map((deg) => (
        <g key={deg} transform={`rotate(${deg} 12 12)`}>
          <path d="M12 12V2.8" />
          <path d="M9.4 5.6 12 8.2 14.6 5.6" />
        </g>
      ))}
    </svg>
  );
}

/** A piece that is half pawn, half rook: it moves as something else for a turn. */
export function ShapeshiftIcon() {
  return (
    <svg className="card-icon" data-testid="icon-shapeshift" viewBox="0 0 24 26" aria-label="Shapeshift" role="img">
      <path d="M12 2.6a4 4 0 0 0 0 8z" fill="currentColor" />
      <path d="M12 3h1.8v2h2V3h1.8v2h2v6H12z" fill="currentColor" />
      <path d="M12 11v1.6c0 3.4-2.6 4.8-3.8 8.4h3.8z" fill="currentColor" />
      <path d="M12 11h6v1.6c0 3.4 0 4.8 1.4 8.4H12z" fill="currentColor" />
      <path d="M5.5 22h13v2h-13z" fill="currentColor" />
      <path d="M12 2v21" stroke="rgba(0,0,0,0.28)" strokeWidth="1.2" strokeDasharray="1.8 1.6" />
    </svg>
  );
}

/** Two hands of cards changing sides. */
export function TradeIcon() {
  return (
    <svg className="card-icon" data-testid="icon-trade" viewBox="0 0 24 24" aria-label="Trade hands" role="img">
      <rect x="1.8" y="7" width="8.4" height="12" rx="1.8" fill="currentColor" transform="rotate(-10 6 13)" />
      <rect x="13.8" y="5" width="8.4" height="12" rx="1.8" fill="currentColor" transform="rotate(10 18 11)" />
      <path d="M8.6 3.6h6.8M12.6 1.4l2.8 2.2-2.8 2.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M15.4 21.4H8.6M11.4 19.2l-2.8 2.2 2.8 2.2" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The picture a card shows instead of a symbol, or null when it just shows text. */
function cardIcon(card: Card, label?: string) {
  if (card.kind === 'skip') return <ShieldIcon />;
  if (label !== undefined || card.kind !== 'num') return null;
  switch (card.value) {
    case 6: return <SwapIcon />;
    case 7: return <FreezeIcon />;
    case 8: return <ShapeshiftIcon />;
    case 9: return <TradeIcon />;
    default: return null;
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
  const icon = cardIcon(card, label);
  return (
    <button
      type="button"
      className={`card card-${colour}${selected ? ' selected' : ''}${small ? ' small' : ''}`}
      disabled={disabled}
      onClick={onClick}
      data-testid={`card-${card.id}`}
      title={asOne ? `${cardName(card)} (play as a 1 move)` : cardName(card)}
    >
      <span className="corner">{icon ?? label ?? cardSymbol(card)}</span>
      <span className={`face${!icon && (label ?? cardSymbol(card)).length > 2 ? ' wide' : ''}`}>
        {icon ?? label ?? cardSymbol(card)}
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
