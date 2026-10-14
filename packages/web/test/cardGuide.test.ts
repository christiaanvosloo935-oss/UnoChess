import { describe, it, expect } from 'vitest';
import { buildDeck } from '@isachess/engine';
import { GUIDE, heldEntries } from '../src/cardGuide';

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
