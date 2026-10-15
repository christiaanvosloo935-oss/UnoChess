import type { PlayerView } from './view.js';
import type { Action, PlayerId } from './types.js';

export interface ChatMessage {
  playerId: PlayerId;
  from: string;
  text: string;
}

export interface RoomInfo {
  names: Record<PlayerId, string>;
  connected: Record<PlayerId, boolean>;
  rematch: Record<PlayerId, boolean>;
}

export type ClientMessage =
  | { type: 'join'; gameId: string; nickname: string; seatToken?: string }
  | { type: 'action'; action: Action }
  | { type: 'rematch' }
  | { type: 'chat'; text: string };

export type ServerMessage =
  | { type: 'joined'; gameId: string; seatToken: string; playerId: PlayerId }
  | { type: 'lobby'; gameId: string; names: string[]; needed: number } // waiting for players; `needed` seats still empty
  | { type: 'state'; view: PlayerView; room: RoomInfo }
  | { type: 'chat'; message: ChatMessage }
  | { type: 'error'; message: string }
  | { type: 'gone'; reason: 'not-found' | 'full' };
