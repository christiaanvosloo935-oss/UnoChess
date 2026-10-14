import type { Card } from '@isachess/engine';
import { GOOD_TO_KNOW, GUIDE, heldEntries } from '../cardGuide';
import { CardView } from './CardView';

export function CardGuide({ hand = [] }: { hand?: readonly Card[] }) {
  const held = new Set(heldEntries(hand));
  return (
    <div className="card-guide" data-testid="card-guide">
      <ul className="guide-list">
        {GUIDE.map((entry) => (
          <li key={entry.title} className={`guide-entry${held.has(entry) ? ' held' : ''}`} data-testid="guide-entry">
            <CardView card={entry.sample} label={entry.label} caption={entry.caption} disabled small />
            <div>
              <h4>
                {entry.title}
                {held.has(entry) && <span className="held-badge">In your hand</span>}
              </h4>
              <p>{entry.text}</p>
            </div>
          </li>
        ))}
      </ul>
      <div className="good-to-know">
        <h4>Good to know</h4>
        <ul>
          {GOOD_TO_KNOW.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function CardGuideModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop">
      <div className="modal guide-modal" role="dialog" aria-label="How the cards work">
        <h3>How the cards work</h3>
        <CardGuide />
        <button type="button" onClick={onClose} data-testid="guide-close">Close</button>
      </div>
    </div>
  );
}
