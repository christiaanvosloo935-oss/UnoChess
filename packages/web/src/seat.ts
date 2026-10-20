import { PIECE_COLOURS } from './pieceColours';
import type { PieceColour } from '@isachess/engine';

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

const COLOUR_KEY = 'uc_colour';

export function getColour(): PieceColour {
  try {
    return PIECE_COLOURS.find((c) => c === localStorage.getItem(COLOUR_KEY)) ?? 'white';
  } catch {
    return 'white';
  }
}

export function saveColour(colour: PieceColour): void {
  try {
    localStorage.setItem(COLOUR_KEY, colour);
  } catch {
    /* private mode: remembering the colour is only a convenience */
  }
}
