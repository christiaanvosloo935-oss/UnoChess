import { describe, it, expect } from 'vitest';
import { buildDeck } from '@isachess/engine';
import { GUIDE, heldEntries } from '../src/cardGuide';
import { cardSymbol } from '../src/components/CardView';

describe('card guide', () => {
  it('explains every kind of card: 11 entries, each with plain text', () => {
    expect(GUIDE).toHaveLength(11);
    for (const entry of GUIDE) {
      expect(entry.title.length).toBeGreaterThan(0);
      expect(entry.text.length).toBeGreaterThan(20);
    }
  });

  it('every card in the 108-card deck matches exactly one entry', () => {
    for (const card of buildDeck()) {
      const hits = GUIDE.filter((e) => e.matches(card));
      expect(hits, `${card.kind} ${card.value ?? ''}`).toHaveLength(1);
    }
  });

  it('heldEntries lists the entries for the cards in a hand, once each', () => {
    const deck = buildDeck();
    const pick = (kind: string, value?: number) => deck.find((c) => c.kind === kind && c.value === value)!;
    const hand = [pick('num', 3), pick('num', 4), pick('num', 6), pick('reverse')];
    const held = heldEntries(hand).map((e) => e.title);
    expect(held).toHaveLength(3);
    expect(held).toEqual(expect.arrayContaining([GUIDE.find((e) => e.matches(pick('num', 3)))!.title]));
    expect(heldEntries([])).toEqual([]);
  });
});

describe('three-player notes', () => {
  it('exist for exactly the four targeted cards', () => {
    const deck = buildDeck();
    const noted = GUIDE.filter((e) => e.threePlayerNote).map((e) => e.title);
    expect(noted).toHaveLength(4);
    for (const card of deck) {
      const entry = GUIDE.find((e) => e.matches(card))!;
      const targeted = (card.kind === 'num' && card.value === 9) || ['reverse', 'draw2', 'wild4'].includes(card.kind);
      expect(!!entry.threePlayerNote, `${card.kind} ${card.value ?? ''}`).toBe(targeted);
    }
  });
});

describe('card symbols', () => {
  it('the Revive card is marked R, not W', () => {
    const wild = buildDeck().find((c) => c.kind === 'wild')!;
    expect(cardSymbol(wild)).toBe('R');
  });
});
