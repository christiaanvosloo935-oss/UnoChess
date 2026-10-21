import type { PieceColour, Variant } from '@isachess/engine';

export async function createGame(nickname: string, variant: Variant, colour: PieceColour): Promise<{ gameId: string; seatToken: string; playerId: string }> {
  const res = await fetch('/api/games', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nickname, variant, colour }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? 'Could not create a game.');
  }
  return res.json();
}

/** The colours already picked in a game, so a newcomer can't choose one of them. */
export async function takenColours(gameId: string): Promise<PieceColour[]> {
  try {
    const res = await fetch(`/api/games/${gameId}`);
    return res.ok ? ((await res.json()) as { colours: PieceColour[] }).colours : [];
  } catch {
    return [];
  }
}
