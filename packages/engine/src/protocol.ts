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
  opponentConnected: boolean;
  rematch: { you: boolean; opponent: boolean };
}

export type ClientMessage =
  | { type: 'join'; gameId: string; nickname: string; colour?: PieceColour; seatToken?: string }
  | { type: 'action'; action: Action }
  | { type: 'rematch' }
  | { type: 'chat'; text: string };

export type ServerMessage =
  | { type: 'joined'; gameId: string; seatToken: string; playerId: PlayerId }
  | { type: 'lobby'; gameId: string; names: string[]; colours: PieceColour[] } // waiting for the second player
  | { type: 'state'; view: PlayerView; room: RoomInfo }
  | { type: 'chat'; message: ChatMessage }
  | { type: 'error'; message: string }
  | { type: 'gone'; reason: 'not-found' | 'full' };
