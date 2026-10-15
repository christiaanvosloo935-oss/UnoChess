import type { Variant } from '@isachess/engine';

export async function createGame(nickname: string, variant: Variant): Promise<{ gameId: string; seatToken: string; playerId: string }> {
  const res = await fetch('/api/games', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nickname, variant }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? 'Could not create a game.');
  }
  return res.json();
}
