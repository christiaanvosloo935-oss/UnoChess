import type { PieceColour } from '@isachess/engine';

export async function createGame(nickname: string, colour: PieceColour): Promise<{ gameId: string; seatToken: string; playerId: string }> {
  const res = await fetch('/api/games', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nickname, colour }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? 'Could not create a game.');
  }
  return res.json();
}

/** The colour the game's creator picked, so a newcomer can't choose the same one. */
export async function hostColour(gameId: string): Promise<PieceColour | undefined> {
  try {
    const res = await fetch(`/api/games/${gameId}`);
    return res.ok ? ((await res.json()) as { colour: PieceColour }).colour : undefined;
  } catch {
    return undefined;
  }
}
