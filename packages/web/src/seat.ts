const MAX_AGE = 7 * 24 * 60 * 60;

export function getSeat(gameId: string): string | undefined {
  const name = `uc_${gameId}=`;
  const hit = document.cookie.split('; ').find((c) => c.startsWith(name));
  return hit ? decodeURIComponent(hit.slice(name.length)) : undefined;
}

export function setSeat(gameId: string, token: string): void {
  document.cookie = `uc_${gameId}=${encodeURIComponent(token)}; path=/; max-age=${MAX_AGE}; SameSite=Lax`;
}

const NICK_KEY = 'uc_nick';

export function getNickname(): string {
  try {
    return localStorage.getItem(NICK_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveNickname(nick: string): void {
  try {
    localStorage.setItem(NICK_KEY, nick);
  } catch {
    /* private mode: remembering the nickname is only a convenience */
  }
}
