import type { PlayerView } from './view.js';
import type { Action, PlayerId } from './types.js';

export interface RoomInfo {
  names: Record<PlayerId, string>;
  opponentConnected: boolean;
  rematch: { you: boolean; opponent: boolean };
}

export type ClientMessage =
  | { type: 'join'; gameId: string; nickname: string; seatToken?: string }
  | { type: 'action'; action: Action }
  | { type: 'rematch' };

export type ServerMessage =
  | { type: 'joined'; gameId: string; seatToken: string; playerId: PlayerId }
  | { type: 'lobby'; gameId: string; names: string[] } // waiting for the second player
  | { type: 'state'; view: PlayerView; room: RoomInfo }
  | { type: 'error'; message: string }
  | { type: 'gone'; reason: 'not-found' | 'full' };
