import type { Card } from '@isachess/engine';

export interface GuideEntry {
  title: string;
  text: string;
  sample: Card; // the card drawn next to the explanation
  label?: string; // overrides the symbol on the sample (e.g. "1–5")
  caption?: string;
  threePlayerNote?: string; // extra line shown in three-player games
  matches: (card: Card) => boolean;
}

const sample = (kind: Card['kind'], colour: Card['colour'], value?: number): Card => ({
  id: `guide-${kind}-${value ?? ''}`,
  kind,
  colour,
  ...(value !== undefined ? { value } : {}),
});
const num = (v: number) => (card: Card) => card.kind === 'num' && card.value === v;
const kind = (k: Card['kind']) => (card: Card) => card.kind === k;

export const GUIDE: GuideEntry[] = [
  {
    title: '0 · Rest',
    text: 'You pass. Make no moves this turn.',
    sample: sample('num', 'red', 0),
    matches: num(0),
  },
  {
    title: '1–5 · Moves',
    text: 'Make that many moves, one after another. Each piece can move up to twice, and the moment you give check your turn ends.',
    sample: sample('num', 'blue', 3),
    label: '1–5',
    caption: 'Moves',
    matches: (c) => c.kind === 'num' && c.value! >= 1 && c.value! <= 5,
  },
  {
    title: '6 · Swap',
    text: "Swap the positions of any two of your own pieces. A swap can't give check or leave your own king in check, and a frozen piece can't be swapped.",
    sample: sample('num', 'green', 6),
    matches: num(6),
  },
  {
    title: '7 · Freeze',
    text: "Choose one enemy piece. It can't move on their next turn, but it can still be captured.",
    sample: sample('num', 'yellow', 7),
    matches: num(7),
  },
  {
    title: '8 · Shapeshift',
    text: 'One of your pieces makes one move as any other piece type, for example a bishop jumping like a knight. Normal blocking still applies, and the piece goes back to normal afterwards.',
    sample: sample('num', 'red', 8),
    matches: num(8),
  },
  {
    title: '9 · Trade Hands',
    text: "Swap your whole hand with your opponent's.",
    sample: sample('num', 'blue', 9),
    threePlayerNote: 'In a three-player game, you choose which opponent.',
    matches: num(9),
  },
  {
    title: 'Shield',
    text: "Choose one of your pieces (not the king). It can't be captured until your next turn. You make no moves this turn.",
    sample: sample('skip', 'green'),
    matches: kind('skip'),
  },
  {
    title: 'Switch sides',
    text: 'You and your opponent swap seats and now control the other army. Each of you keeps your own hand.',
    sample: sample('reverse', 'yellow'),
    threePlayerNote: 'In a three-player game, you choose which opponent.',
    matches: kind('reverse'),
  },
  {
    title: 'Draw two',
    text: 'Your opponent skips their next turn and draws 2 cards.',
    sample: sample('draw2', 'red'),
    threePlayerNote: 'In a three-player game, you choose which opponent.',
    matches: kind('draw2'),
  },
  {
    title: 'Revive',
    text: "Bring back one of your captured pieces onto any empty square in your first two rows. It can't give check. A captured pawn may come back as a queen. If nothing of yours has been captured, nothing happens.",
    sample: sample('wild', null),
    matches: kind('wild'),
  },
  {
    title: 'Draw four',
    text: 'Your opponent skips their next turn and draws 4 cards.',
    sample: sample('wild4', null),
    threePlayerNote: 'In a three-player game, you choose which opponent.',
    matches: kind('wild4'),
  },
];

export const GOOD_TO_KNOW = [
  "Card colours don't matter: any card can be played at any time.",
  'After every card, everyone is topped up to 7 cards. Nobody ever holds fewer than 7, as long as the draw pile lasts.',
  "If you're in check, the card you play must get you out of it. Or play any card as a single move.",
  'You win by checkmate. Running out of cards never ends the game.',
];

/** The guide entries for the cards in a hand, once each. */
export function heldEntries(hand: readonly Card[]): GuideEntry[] {
  return GUIDE.filter((entry) => hand.some((card) => entry.matches(card)));
}
