import { shuffle } from './rng.js';
import type { Card, CardKind, Colour } from './types.js';

const COLOURS: Colour[] = ['red', 'yellow', 'green', 'blue'];
const EXTRA_MOVE_CARDS = [1, 2, 3, 3, 4, 5];

export function buildDeck(): Card[] {
  const deck: Card[] = [];
  const add = (kind: CardKind, colour: Colour | null, value?: number) => {
    const card: Card = { id: `c${deck.length}`, kind, colour };
    if (value !== undefined) card.value = value;
    deck.push(card);
  };
  for (const colour of COLOURS) {
    add('num', colour, 0);
    for (let v = 1; v <= 9; v++) {
      add('num', colour, v);
      add('num', colour, v);
    }
    for (const kind of ['skip', 'reverse', 'draw2'] as const) {
      add(kind, colour);
      add(kind, colour);
    }
  }
  for (let i = 0; i < 4; i++) {
    add('wild', null);
    add('wild4', null);
  }
  // 15% more move cards (1-5): 40 became 46. Colour never matters, so the extras rotate through the colours.
  EXTRA_MOVE_CARDS.forEach((value, i) => add('num', COLOURS[i % COLOURS.length], value));
  return deck;
}

export interface Piles {
  drawPile: Card[];
  discardPile: Card[];
  seed: number;
}

/** Draws up to n cards. An empty draw pile is refilled by shuffling the discard pile except its top card. */
export function drawCards(piles: Piles, n: number): { cards: Card[]; piles: Piles } {
  let drawPile = piles.drawPile.slice();
  let discardPile = piles.discardPile.slice();
  let seed = piles.seed;
  const cards: Card[] = [];
  while (cards.length < n) {
    if (drawPile.length === 0) {
      if (discardPile.length <= 1) break;
      const top = discardPile[discardPile.length - 1];
      [drawPile, seed] = shuffle(discardPile.slice(0, -1), seed);
      discardPile = [top];
    }
    cards.push(drawPile.shift()!);
  }
  return { cards, piles: { drawPile, discardPile, seed } };
}
