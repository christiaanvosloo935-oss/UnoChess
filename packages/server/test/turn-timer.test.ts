import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Rooms, TURN_MS } from '../src/rooms.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function twoPlayerGame(rooms: Rooms) {
  const a = rooms.create('Alice');
  const b = rooms.join(a.gameId, 'Bob');
  if (!b.ok) throw new Error('join failed');
  return { gameId: a.gameId, alice: a.playerId, bob: b.playerId };
}

const turnMsLeft = (rooms: Rooms, gameId: string, player: string) => {
  const snap = rooms.snapshot(gameId, player);
  return snap?.type === 'state' ? snap.room.turnMsLeft : undefined;
};
const current = (rooms: Rooms, gameId: string) => rooms.get(gameId)!.state!.current;

describe('turn timer', () => {
  it('a turn lasts one minute', () => {
    expect(TURN_MS).toBe(60_000);
  });

  it('starts when the game starts and counts down', () => {
    const rooms = new Rooms({ seed: () => 1 });
    const g = twoPlayerGame(rooms);
    expect(turnMsLeft(rooms, g.gameId, g.alice)).toBe(TURN_MS);
    vi.advanceTimersByTime(20_000);
    expect(turnMsLeft(rooms, g.gameId, g.bob)).toBe(TURN_MS - 20_000);
  });

  it('skips the turn when a minute passes without a play', () => {
    const rooms = new Rooms({ seed: () => 1 });
    const g = twoPlayerGame(rooms);
    const seen: string[] = [];
    rooms.onChange((id) => seen.push(id));
    expect(current(rooms, g.gameId)).toBe(g.alice);
    vi.advanceTimersByTime(TURN_MS - 1);
    expect(current(rooms, g.gameId)).toBe(g.alice);
    vi.advanceTimersByTime(1);
    expect(current(rooms, g.gameId)).toBe(g.bob);
    expect(seen).toContain(g.gameId);
    expect(rooms.get(g.gameId)!.state!.log.at(-1)).toMatchObject({ player: g.alice, text: 'ran out of time and skips their turn' });
    expect(turnMsLeft(rooms, g.gameId, g.bob)).toBe(TURN_MS);
  });

  it('keeps skipping while nobody plays', () => {
    const rooms = new Rooms({ seed: () => 1 });
    const g = twoPlayerGame(rooms);
    vi.advanceTimersByTime(TURN_MS * 3);
    expect(current(rooms, g.gameId)).toBe(g.bob);
    expect(rooms.get(g.gameId)!.state!.turn).toBe(4);
  });

  it('a play restarts the clock for the next player', () => {
    const rooms = new Rooms({ seed: () => 1 });
    const g = twoPlayerGame(rooms);
    const state = rooms.get(g.gameId)!.state!;
    state.hands[g.alice][0] = { id: 'one', kind: 'num', colour: 'red', value: 1 };
    vi.advanceTimersByTime(40_000);
    expect(rooms.act(g.gameId, g.alice, { type: 'playCard', cardId: 'one' })).toEqual({ ok: true });
    expect(rooms.act(g.gameId, g.alice, { type: 'doneMoving' })).toEqual({ ok: true });
    expect(current(rooms, g.gameId)).toBe(g.bob);
    expect(turnMsLeft(rooms, g.gameId, g.bob)).toBe(TURN_MS);
    vi.advanceTimersByTime(59_000);
    expect(current(rooms, g.gameId)).toBe(g.bob);
  });

  it('the clock keeps running while a player is in the middle of a card', () => {
    const rooms = new Rooms({ seed: () => 1 });
    const g = twoPlayerGame(rooms);
    rooms.get(g.gameId)!.state!.hands[g.alice][0] = { id: 'two', kind: 'num', colour: 'red', value: 2 };
    vi.advanceTimersByTime(30_000);
    rooms.act(g.gameId, g.alice, { type: 'playCard', cardId: 'two' });
    expect(turnMsLeft(rooms, g.gameId, g.alice)).toBe(TURN_MS - 30_000);
    vi.advanceTimersByTime(30_000);
    expect(current(rooms, g.gameId)).toBe(g.bob);
    expect(rooms.get(g.gameId)!.state!.phase).toEqual({ kind: 'awaitingCard' });
  });

  it('stops when the game is over', () => {
    const rooms = new Rooms({ seed: () => 1 });
    const g = twoPlayerGame(rooms);
    rooms.act(g.gameId, g.bob, { type: 'resign' });
    expect(turnMsLeft(rooms, g.gameId, g.alice)).toBeNull();
    const turn = rooms.get(g.gameId)!.state!.turn;
    vi.advanceTimersByTime(TURN_MS * 2);
    expect(rooms.get(g.gameId)!.state!.turn).toBe(turn);
  });

  it('a rematch starts a fresh clock', () => {
    const rooms = new Rooms({ seed: () => 1 });
    const g = twoPlayerGame(rooms);
    rooms.act(g.gameId, g.bob, { type: 'resign' });
    rooms.rematch(g.gameId, g.alice);
    rooms.rematch(g.gameId, g.bob);
    expect(turnMsLeft(rooms, g.gameId, g.alice)).toBe(TURN_MS);
    vi.advanceTimersByTime(TURN_MS);
    expect(rooms.get(g.gameId)!.state!.turn).toBe(2);
  });

  it('works the same way in a three-player game, going round the table', () => {
    const rooms = new Rooms({ seed: () => 1 });
    const a = rooms.create('Alice', 'three');
    const b = rooms.join(a.gameId, 'Bob');
    const c = rooms.join(a.gameId, 'Cy');
    if (!b.ok || !c.ok) throw new Error('join failed');
    expect(turnMsLeft(rooms, a.gameId, a.playerId)).toBe(TURN_MS);
    for (const expected of [b.playerId, c.playerId, a.playerId]) {
      vi.advanceTimersByTime(TURN_MS);
      expect(current(rooms, a.gameId)).toBe(expected);
    }
  });

  it('can be shortened for tests', () => {
    const rooms = new Rooms({ seed: () => 1, turnMs: 1000 });
    const g = twoPlayerGame(rooms);
    vi.advanceTimersByTime(1000);
    expect(current(rooms, g.gameId)).toBe(g.bob);
  });
});
