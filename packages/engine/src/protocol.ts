import type { PlayerView } from './view.js';
import type { Action, PlayerId } from './types.js';

export interface ChatMessage {
  playerId: PlayerId;
  from: string;
  text: string;
}

export const PIECE_COLOURS = ['red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'violet', 'black', 'white'] as const;
export type PieceColour = (typeof PIECE_COLOURS)[number];

export interface RoomInfo {
  names: Record<PlayerId, string>;
  colours: Record<PlayerId, PieceColour>;
  connected: Record<PlayerId, boolean>;
  turnMsLeft: number | null; // time left to finish the current turn; null when no turn is running
  rematch: Record<PlayerId, boolean>;
}

export type ClientMessage =
  | { type: 'join'; gameId: string; nickname: string; colour?: PieceColour; seatToken?: string }
  | { type: 'action'; action: Action }
  | { type: 'rematch' }
  | { type: 'chat'; text: string };

export type ServerMessage =
  | { type: 'joined'; gameId: string; seatToken: string; playerId: PlayerId }
  | { type: 'lobby'; gameId: string; names: string[]; colours: PieceColour[]; needed: number } // waiting for players; `needed` seats still empty
  | { type: 'state'; view: PlayerView; room: RoomInfo }
  | { type: 'chat'; message: ChatMessage }
  | { type: 'error'; message: string }
  | { type: 'gone'; reason: 'not-found' | 'full' };
