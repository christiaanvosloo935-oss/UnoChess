import { randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  PIECE_COLOURS, apply, createGame, geometryFor, skipTurn, viewFor,
  type Action, type ChatMessage, type GameState, type PieceColour, type PlayerId, type RoomInfo, type ServerMessage, type Variant,
} from '@isachess/engine';

const ID_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';
export const MAX_CHAT_LENGTH = 200;
/** How long a player has for a whole turn (the card and its moves) before the turn is skipped. */
export const TURN_MS = 60_000;
const CHAT_BURST = 5;
const CHAT_WINDOW_MS = 3000;

export interface Seat {
  playerId: PlayerId;
  token: string;
  nickname: string;
  colour: PieceColour;
}

export interface Room {
  id: string;
  variant: Variant;
  capacity: number;
  seats: Seat[];
  state: GameState | null;
  connections: Record<PlayerId, number>;
  rematchVotes: Set<PlayerId>;
  lastActivity: number;
  turnKey: string | null; // which turn the running clock belongs to
  turnDeadline: number | null;
}

export interface RoomsOptions {
  seed?: () => number;
  now?: () => number;
  turnMs?: number;
}

function defaultTurnMs(): number {
  const fixed = Number(process.env.ISACHESS_TURN_MS);
  return Number.isFinite(fixed) && fixed > 0 ? fixed : TURN_MS;
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

export function parseColour(raw: unknown): PieceColour | undefined {
  return PIECE_COLOURS.find((c) => c === raw);
}

/** The wanted colour, unless another player already has it: then black, white, or the first colour nobody has. */
function freeColour(wanted: PieceColour | undefined, taken: PieceColour[]): PieceColour {
  const want = wanted ?? 'black';
  if (!taken.includes(want)) return want;
  return (['black', 'white', ...PIECE_COLOURS] as PieceColour[]).find((c) => !taken.includes(c))!;
}

export class Rooms {
  private rooms = new Map<string, Room>();
  private listeners = new Set<(gameId: string) => void>();
  private seed: () => number;
  private now: () => number;
  private turnMs: number;
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private recentChats = new Map<PlayerId, number[]>();

  constructor(opts: RoomsOptions = {}) {
    this.seed = opts.seed ?? defaultSeed;
    this.now = opts.now ?? Date.now;
    this.turnMs = opts.turnMs ?? defaultTurnMs();
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

  private newSeat(nickname: string, colour: PieceColour): Seat {
    return { playerId: randomUUID(), token: randomBytes(24).toString('base64url'), nickname: cleanName(nickname), colour };
  }

  create(nickname: string, variant: Variant = 'classic', colour?: PieceColour): { gameId: string; seatToken: string; playerId: PlayerId } {
    let gameId: string;
    do {
      gameId = Array.from({ length: 6 }, () => ID_CHARS[randomInt(ID_CHARS.length)]).join('');
    } while (this.rooms.has(gameId));
    const seat = this.newSeat(nickname, colour ?? 'white');
    this.rooms.set(gameId, {
      id: gameId,
      variant,
      capacity: geometryFor(variant).armies.length,
      seats: [seat],
      state: null,
      connections: {},
      rematchVotes: new Set(),
      lastActivity: this.now(),
      turnKey: null,
      turnDeadline: null,
    });
    return { gameId, seatToken: seat.token, playerId: seat.playerId };
  }

  join(
    gameId: string,
    nickname: string,
    seatToken?: string,
    colour?: PieceColour,
  ): { ok: true; playerId: PlayerId; seatToken: string } | { ok: false; reason: 'not-found' | 'full' } {
    const room = this.rooms.get(gameId);
    if (!room) return { ok: false, reason: 'not-found' };
    room.lastActivity = this.now();
    const existing = seatToken ? room.seats.find((s) => sameToken(s.token, seatToken)) : undefined;
    if (existing) return { ok: true, playerId: existing.playerId, seatToken: existing.token };
    if (room.seats.length >= room.capacity) return { ok: false, reason: 'full' };
    const seat = this.newSeat(nickname, freeColour(colour, room.seats.map((x) => x.colour)));
    room.seats.push(seat);
    if (room.seats.length === room.capacity) {
      room.state = createGame(this.seed(), room.seats.map((s) => s.playerId), room.variant);
      this.syncTimer(room);
    }
    this.emit(gameId);
    return { ok: true, playerId: seat.playerId, seatToken: seat.token };
  }

  /** The colours already picked in a game, so a newcomer's picker can mark them as taken. */
  takenColours(gameId: string): PieceColour[] | undefined {
    return this.rooms.get(gameId)?.seats.map((x) => x.colour);
  }

  /** Starts a fresh turn clock whenever the turn has changed hands, and stops it when the game is over. */
  private syncTimer(room: Room): void {
    const state = room.state;
    const key = state && state.phase.kind !== 'over' ? `${state.turn}:${state.current}` : null;
    if (key === room.turnKey) return;
    clearTimeout(this.timers.get(room.id));
    this.timers.delete(room.id);
    room.turnKey = key;
    room.turnDeadline = key ? this.now() + this.turnMs : null;
    if (!state || !key) return;
    const timer = setTimeout(() => this.timeUp(room.id, state.turn), this.turnMs);
    timer.unref();
    this.timers.set(room.id, timer);
  }

  /** The turn clock ran out: skip that turn, unless the turn has already moved on. */
  private timeUp(gameId: string, turn: number): void {
    const room = this.rooms.get(gameId);
    if (!room?.state || room.state.turn !== turn) return;
    const result = skipTurn(room.state);
    if (!result.ok) return;
    room.state = result.state;
    this.syncTimer(room);
    this.emit(gameId);
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
    if (!room.state) return { ok: false, error: 'Waiting for the other players to join.' };
    room.lastActivity = this.now();
    const result = apply(room.state, playerId, action);
    if (!result.ok) return result;
    room.state = result.state;
    this.syncTimer(room);
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
    if (room.state.players.every((p) => room.rematchVotes.has(p))) {
      const [first, ...rest] = room.state.players;
      room.state = createGame(this.seed(), [...rest, first], room.variant);
      room.rematchVotes.clear();
      this.syncTimer(room);
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
      if (room.lastActivity < cutoff) {
        clearTimeout(this.timers.get(id));
        this.timers.delete(id);
        this.rooms.delete(id);
      }
    }
  }

  /** What a given player's screen should show right now. */
  snapshot(gameId: string, playerId: PlayerId): ServerMessage | null {
    const room = this.rooms.get(gameId);
    if (!room) return null;
    if (!room.state) return { type: 'lobby', gameId, names: room.seats.map((s) => s.nickname), colours: room.seats.map((s) => s.colour), needed: room.capacity - room.seats.length };
    const info: RoomInfo = {
      names: Object.fromEntries(room.seats.map((s) => [s.playerId, s.nickname])),
      colours: Object.fromEntries(room.seats.map((s) => [s.playerId, s.colour])),
      connected: Object.fromEntries(room.state.players.map((p) => [p, (room.connections[p] ?? 0) > 0])),
      rematch: Object.fromEntries(room.state.players.map((p) => [p, room.rematchVotes.has(p)])),
      turnMsLeft: room.turnDeadline === null ? null : Math.max(0, room.turnDeadline - this.now()),
    };
    return { type: 'state', view: viewFor(room.state, playerId), room: info };
  }
}
