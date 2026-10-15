import { describe, it, expect } from 'vitest';
import { buildDeck, drawCards, type Card } from '../src/index.js';

const num = (id: string, value = 0): Card => ({ id, kind: 'num', colour: 'red', value });

describe('deck', () => {
  it('has 114 cards with the standard breakdown plus the extra 1-5 cards', () => {
    const deck = buildDeck();
    expect(deck).toHaveLength(114);
    expect(new Set(deck.map((c) => c.id)).size).toBe(114);
    const nums = (v: number) => deck.filter((c) => c.kind === 'num' && c.value === v).length;
    expect(nums(0)).toBe(4);
    for (let v = 6; v <= 9; v++) expect(nums(v)).toBe(8);
    expect([1, 2, 3, 4, 5].map(nums)).toEqual([9, 9, 10, 9, 9]);
    for (const kind of ['skip', 'reverse', 'draw2'] as const) {
      expect(deck.filter((c) => c.kind === kind)).toHaveLength(8);
    }
    for (const kind of ['wild', 'wild4'] as const) {
      const cards = deck.filter((c) => c.kind === kind);
      expect(cards).toHaveLength(4);
      expect(cards.every((c) => c.colour === null)).toBe(true);
    }
  });

  it('gives each colour one 0 and two of each other card, plus its share of the extra 1-5 cards', () => {
    const deck = buildDeck();
    const sizes = ['red', 'yellow', 'green', 'blue'].map((colour) => deck.filter((c) => c.colour === colour).length);
    expect(sizes).toEqual([27, 27, 26, 26]);
    expect(sizes.reduce((a, b) => a + b, 0) + deck.filter((c) => c.colour === null).length).toBe(114);
  });
});

describe('drawCards', () => {
  it('takes from the top of the draw pile', () => {
    const piles = { drawPile: [num('a'), num('b'), num('c')], discardPile: [], seed: 1 };
    const { cards, piles: after } = drawCards(piles, 2);
    expect(cards.map((c) => c.id)).toEqual(['a', 'b']);
    expect(after.drawPile.map((c) => c.id)).toEqual(['c']);
    expect(piles.drawPile).toHaveLength(3);
  });

  it('reshuffles the discard pile but keeps its top card', () => {
    const discard = ['d1', 'd2', 'd3', 'd4', 'top'].map((id) => num(id));
    const { cards, piles } = drawCards({ drawPile: [], discardPile: discard, seed: 7 }, 3);
    expect(cards).toHaveLength(3);
    expect(piles.discardPile.map((c) => c.id)).toEqual(['top']);
    const all = [...cards, ...piles.drawPile].map((c) => c.id).sort();
    expect(all).toEqual(['d1', 'd2', 'd3', 'd4']);
  });

  it('draws what exists when both piles run out', () => {
    const piles = { drawPile: [num('x')], discardPile: [num('y'), num('z')], seed: 3 };
    const { cards, piles: after } = drawCards(piles, 5);
    expect(cards).toHaveLength(2);
    expect(after.discardPile).toHaveLength(1);
    expect(after.drawPile).toHaveLength(0);
  });
});
