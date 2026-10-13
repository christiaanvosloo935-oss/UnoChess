import { inCheckNow } from './state.js';
import type { Card, GameState, PlayerId } from './types.js';

export interface PlayableCard {
  cardId: string;
  asEffect: boolean;
  asOne: boolean;
}

function escapesCheck(_state: GameState, card: Card): boolean {
  return card.kind === 'num' && card.value! >= 1 && card.value! <= 5;
}

/** Which cards the player may play now, and how. In check only escaping effects or the "as a 1" fallback are allowed. */
export function playableCards(state: GameState, player: PlayerId): PlayableCard[] {
  if (state.phase.kind !== 'awaitingCard' || state.current !== player) return [];
  const inCheck = inCheckNow(state);
  return state.hands[player].map((card) => ({
    cardId: card.id,
    asEffect: !inCheck || escapesCheck(state, card),
    asOne: inCheck,
  }));
}
