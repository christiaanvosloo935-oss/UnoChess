import { randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  apply, createGame, viewFor,
  type Action, type ChatMessage, type GameState, type PlayerId, type RoomInfo, type ServerMessage,
} from '@isachess/engine';

const ID_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';
export const MAX_CHAT_LENGTH = 200;
const CHAT_BURST = 5;
const CHAT_WINDOW_MS = 3000;

export interface Seat {
  playerId: PlayerId;
  token: string;
  nickname: string;
}

export interface Room {
  id: string;
  seats: Seat[];
  state: GameState | null;
  connections: Record<PlayerId, number>;
  rematchVotes: Set<PlayerId>;
  lastActivity: number;
}

export interface RoomsOptions {
  seed?: () => number;
  now?: () => number;
}

function defaultSeed(): number {
  const fixed = process.env.ISACHESS_SEED;
  if (fixed !== undefined && fixed !== '' && Number.isFinite(Number(fixed))) return Number(fixed);
  return randomInt(2 ** 31);
}

function sameToken(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function cleanName(raw: string): string {
  return raw.trim().slice(0, 20) || 'Player';
}

export class Rooms {
  private rooms = new Map<string, Room>();
  private listeners = new Set<(gameId: string) => void>();
  private seed: () => number;
  private now: () => number;
  private recentChats = new Map<PlayerId, number[]>();

  constructor(opts: RoomsOptions = {}) {
    this.seed = opts.seed ?? defaultSeed;
    this.now = opts.now ?? Date.now;
  }

  onChange(listener: (gameId: string) => void): void {
    this.listeners.add(listener);
  }

  private emit(gameId: string): void {
    for (const l of this.listeners) l(gameId);
  }

  get(gameId: string): Room | undefined {
    return this.rooms.get(gameId);
  }

  private newSeat(nickname: string): Seat {
    return { playerId: randomUUID(), token: randomBytes(24).toString('base64url'), nickname: cleanName(nickname) };
  }

  create(nickname: string): { gameId: string; seatToken: string; playerId: PlayerId } {
    let gameId: string;
    do {
      gameId = Array.from({ length: 6 }, () => ID_CHARS[randomInt(ID_CHARS.length)]).join('');
    } while (this.rooms.has(gameId));
    const seat = this.newSeat(nickname);
    this.rooms.set(gameId, {
      id: gameId,
      seats: [seat],
      state: null,
      connections: {},
      rematchVotes: new Set(),
      lastActivity: this.now(),
    });
    return { gameId, seatToken: seat.token, playerId: seat.playerId };
  }

  join(
    gameId: string,
    nickname: string,
    seatToken?: string,
  ): { ok: true; playerId: PlayerId; seatToken: string } | { ok: false; reason: 'not-found' | 'full' } {
    const room = this.rooms.get(gameId);
    if (!room) return { ok: false, reason: 'not-found' };
    room.lastActivity = this.now();
    const existing = seatToken ? room.seats.find((s) => sameToken(s.token, seatToken)) : undefined;
    if (existing) return { ok: true, playerId: existing.playerId, seatToken: existing.token };
    if (room.seats.length >= 2) return { ok: false, reason: 'full' };
    const seat = this.newSeat(nickname);
    room.seats.push(seat);
    room.state = createGame(this.seed(), room.seats[0].playerId, seat.playerId);
    this.emit(gameId);
    return { ok: true, playerId: seat.playerId, seatToken: seat.token };
  }

  attach(gameId: string, playerId: PlayerId): void {
    const room = this.rooms.get(gameId);
    if (!room) return;
    room.connections[playerId] = (room.connections[playerId] ?? 0) + 1;
    room.lastActivity = this.now();
    this.emit(gameId);
  }

  detach(gameId: string, playerId: PlayerId): void {
    const room = this.rooms.get(gameId);
    if (!room) return;
    room.connections[playerId] = Math.max(0, (room.connections[playerId] ?? 0) - 1);
    this.emit(gameId);
  }

  act(gameId: string, playerId: PlayerId, action: Action): { ok: true } | { ok: false; error: string } {
    const room = this.rooms.get(gameId);
    if (!room || !room.seats.some((s) => s.playerId === playerId)) return { ok: false, error: 'Unknown game.' };
    if (!room.state) return { ok: false, error: 'Waiting for your opponent to join.' };
    room.lastActivity = this.now();
    const result = apply(room.state, playerId, action);
    if (!result.ok) return result;
    room.state = result.state;
    this.emit(gameId);
    return { ok: true };
  }

  rematch(gameId: string, playerId: PlayerId): { ok: true } | { ok: false; error: string } {
    const room = this.rooms.get(gameId);
    if (!room || !room.state || !room.seats.some((s) => s.playerId === playerId)) {
      return { ok: false, error: 'Unknown game.' };
    }
    if (room.state.phase.kind !== 'over') return { ok: false, error: 'The game is not over yet.' };
    room.lastActivity = this.now();
    room.rematchVotes.add(playerId);
    if (room.rematchVotes.size === 2) {
      const [first, second] = room.state.players;
      room.state = createGame(this.seed(), second, first);
      room.rematchVotes.clear();
    }
    this.emit(gameId);
    return { ok: true };
  }

  /** Validates a chat line. Nothing is stored: the caller passes the returned message on to the players' sockets. */
  chat(gameId: string, playerId: PlayerId, rawText: string): { ok: true; message: ChatMessage } | { ok: false; error: string } {
    const room = this.rooms.get(gameId);
    const seat = room?.seats.find((s) => s.playerId === playerId);
    if (!room || !seat) return { ok: false, error: 'Unknown game.' };
    const text = rawText.trim();
    if (text.length === 0) return { ok: false, error: 'Type a message first.' };
    if (text.length > MAX_CHAT_LENGTH) return { ok: false, error: `Messages can be at most ${MAX_CHAT_LENGTH} characters.` };
    const now = this.now();
    const recent = (this.recentChats.get(playerId) ?? []).filter((t) => now - t < CHAT_WINDOW_MS);
    if (recent.length >= CHAT_BURST) return { ok: false, error: 'Slow down a little.' };
    recent.push(now);
    this.recentChats.set(playerId, recent);
    room.lastActivity = now;
    return { ok: true, message: { playerId, from: seat.nickname, text } };
  }

  cleanup(maxIdleMs: number): void {
    const cutoff = this.now() - maxIdleMs;
    for (const [id, room] of this.rooms) {
      if (room.lastActivity < cutoff) this.rooms.delete(id);
    }
  }

  /** What a given player's screen should show right now. */
  snapshot(gameId: string, playerId: PlayerId): ServerMessage | null {
    const room = this.rooms.get(gameId);
    if (!room) return null;
    if (!room.state) return { type: 'lobby', gameId, names: room.seats.map((s) => s.nickname) };
    const opponent = room.state.players.find((p) => p !== playerId)!;
    const info: RoomInfo = {
      names: Object.fromEntries(room.seats.map((s) => [s.playerId, s.nickname])),
      opponentConnected: (room.connections[opponent] ?? 0) > 0,
      rematch: { you: room.rematchVotes.has(playerId), opponent: room.rematchVotes.has(opponent) },
    };
    return { type: 'state', view: viewFor(room.state, playerId), room: info };
  }
}
