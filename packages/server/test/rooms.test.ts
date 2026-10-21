import { describe, it, expect } from 'vitest';
import { Rooms } from '../src/rooms.js';

describe('Rooms', () => {
  it('create + join starts a game with the creator as white', () => {
    const rooms = new Rooms({ seed: () => 1 });
    const a = rooms.create('Alice');
    expect(a.gameId).toMatch(/^[a-z2-9]{6}$/);
    expect(rooms.get(a.gameId)!.state).toBeNull();
    const b = rooms.join(a.gameId, 'Bob');
    expect(b.ok).toBe(true);
    const state = rooms.get(a.gameId)!.state!;
    expect(state.players[0]).toBe(a.playerId);
    expect(state.hands[a.playerId]).toHaveLength(7);
  });

  it('each player keeps the piece colour they picked, shown to both', () => {
    const rooms = new Rooms({ seed: () => 1 });
    const a = rooms.create('Alice', 'classic', 'violet');
    expect(rooms.takenColours(a.gameId)).toEqual(['violet']);
    const b = rooms.join(a.gameId, 'Bob', undefined, 'orange');
    if (!b.ok) throw new Error('join failed');
    const snap = rooms.snapshot(a.gameId, a.playerId);
    expect(snap).toMatchObject({ type: 'state', room: { colours: { [a.playerId]: 'violet', [b.playerId]: 'orange' } } });
  });

  it('a joiner who picks the creator\'s colour gets black (or white) instead', () => {
    const rooms = new Rooms({ seed: () => 1 });
    const a = rooms.create('Alice', 'classic', 'black');
    const b = rooms.join(a.gameId, 'Bob', undefined, 'black');
    if (!b.ok) throw new Error('join failed');
    const snap = rooms.snapshot(a.gameId, b.playerId);
    expect(snap).toMatchObject({ room: { colours: { [a.playerId]: 'black', [b.playerId]: 'white' } } });
  });

  it('in a three-player game no two players share a colour', () => {
    const rooms = new Rooms({ seed: () => 1 });
    const a = rooms.create('Alice', 'three', 'red');
    const b = rooms.join(a.gameId, 'Bob', undefined, 'red');
    const c = rooms.join(a.gameId, 'Cy', undefined, 'black');
    if (!b.ok || !c.ok) throw new Error('join failed');
    const taken = rooms.takenColours(a.gameId)!;
    expect(new Set(taken).size).toBe(3);
    expect(taken).toEqual(['red', 'black', 'white']);
    expect(rooms.snapshot(a.gameId, a.playerId)).toMatchObject({ room: { colours: { [a.playerId]: 'red', [b.playerId]: 'black', [c.playerId]: 'white' } } });
  });

  it('a third visitor is told the game is full; unknown games are not found', () => {
    const rooms = new Rooms();
    const a = rooms.create('Alice');
    rooms.join(a.gameId, 'Bob');
    expect(rooms.join(a.gameId, 'Carol')).toEqual({ ok: false, reason: 'full' });
    expect(rooms.join('zzzzzz', 'Dan')).toEqual({ ok: false, reason: 'not-found' });
  });

  it('reconnecting with a seat token keeps the seat', () => {
    const rooms = new Rooms();
    const a = rooms.create('Alice');
    const b = rooms.join(a.gameId, 'Bob');
    if (!b.ok) throw new Error('join failed');
    const again = rooms.join(a.gameId, 'Alice', a.seatToken);
    expect(again).toEqual({ ok: true, playerId: a.playerId, seatToken: a.seatToken });
    const wrong = rooms.join(a.gameId, 'Mallory', 'not-a-token');
    expect(wrong).toEqual({ ok: false, reason: 'full' });
  });

  it('a rematch needs both votes, swaps colours, and only starts after game over', () => {
    const rooms = new Rooms({ seed: () => 5 });
    const a = rooms.create('Alice');
    const b = rooms.join(a.gameId, 'Bob');
    if (!b.ok) throw new Error('join failed');
    expect(rooms.rematch(a.gameId, a.playerId)).toMatchObject({ ok: false });
    expect(rooms.act(a.gameId, a.playerId, { type: 'resign' })).toEqual({ ok: true });
    expect(rooms.rematch(a.gameId, a.playerId)).toEqual({ ok: true });
    expect(rooms.get(a.gameId)!.state!.phase.kind).toBe('over');
    expect(rooms.rematch(a.gameId, b.playerId)).toEqual({ ok: true });
    const state = rooms.get(a.gameId)!.state!;
    expect(state.phase.kind).toBe('awaitingCard');
    expect(state.players).toEqual([b.playerId, a.playerId]);
    expect(state.seats.w).toBe(b.playerId);
  });

  describe('three-player rooms', () => {
    const fill = (rooms: Rooms) => {
      const a = rooms.create('Alice', 'three');
      const b = rooms.join(a.gameId, 'Bob');
      const c = rooms.join(a.gameId, 'Carol');
      if (!b.ok || !c.ok) throw new Error('join failed');
      return { a, b, c };
    };

    it('a three-player room stays in the lobby until the third seat is taken', () => {
      const rooms = new Rooms({ seed: () => 1 });
      const a = rooms.create('Alice', 'three');
      expect(rooms.snapshot(a.gameId, a.playerId)).toMatchObject({ type: 'lobby', names: ['Alice'], needed: 2 });
      const b = rooms.join(a.gameId, 'Bob');
      expect(b.ok).toBe(true);
      expect(rooms.get(a.gameId)!.state).toBeNull();
      expect(rooms.snapshot(a.gameId, a.playerId)).toMatchObject({ type: 'lobby', names: ['Alice', 'Bob'], needed: 1 });
      expect(rooms.act(a.gameId, a.playerId, { type: 'resign' })).toMatchObject({ ok: false });
      const c = rooms.join(a.gameId, 'Carol');
      expect(c.ok).toBe(true);
      const snap = rooms.snapshot(a.gameId, a.playerId);
      expect(snap).toMatchObject({ type: 'state', view: { variant: 'three' } });
      expect(rooms.get(a.gameId)!.state!.players).toHaveLength(3);
    });

    it("a fourth visitor gets 'full'", () => {
      const rooms = new Rooms();
      const { a } = fill(rooms);
      expect(rooms.join(a.gameId, 'Dan')).toEqual({ ok: false, reason: 'full' });
    });

    it('a seated player re-joining with their token in the lobby keeps their seat', () => {
      const rooms = new Rooms();
      const a = rooms.create('Alice', 'three');
      const b = rooms.join(a.gameId, 'Bob');
      if (!b.ok) throw new Error('join failed');
      expect(rooms.join(a.gameId, 'Bob', b.seatToken)).toEqual({ ok: true, playerId: b.playerId, seatToken: b.seatToken });
      expect(rooms.get(a.gameId)!.seats).toHaveLength(2);
      expect(rooms.get(a.gameId)!.state).toBeNull();
    });

    it('rematch needs all three votes and rotates seats', () => {
      const rooms = new Rooms({ seed: () => 5 });
      const { a, b, c } = fill(rooms);
      expect(rooms.rematch(a.gameId, a.playerId)).toMatchObject({ ok: false });
      expect(rooms.act(a.gameId, a.playerId, { type: 'resign' })).toEqual({ ok: true });
      expect(rooms.act(a.gameId, b.playerId, { type: 'resign' })).toEqual({ ok: true });
      expect(rooms.get(a.gameId)!.state!.phase.kind).toBe('over');
      expect(rooms.rematch(a.gameId, a.playerId)).toEqual({ ok: true });
      expect(rooms.rematch(a.gameId, b.playerId)).toEqual({ ok: true });
      expect(rooms.get(a.gameId)!.state!.phase.kind).toBe('over');
      expect(rooms.snapshot(a.gameId, a.playerId)).toMatchObject({
        room: { rematch: { [a.playerId]: true, [b.playerId]: true, [c.playerId]: false } },
      });
      expect(rooms.rematch(a.gameId, c.playerId)).toEqual({ ok: true });
      const state = rooms.get(a.gameId)!.state!;
      expect(state.variant).toBe('three');
      expect(state.phase.kind).toBe('awaitingCard');
      expect(state.players).toEqual([b.playerId, c.playerId, a.playerId]);
    });
  });

  it('acting before the opponent joins is refused', () => {
    const rooms = new Rooms();
    const a = rooms.create('Alice');
    expect(rooms.act(a.gameId, a.playerId, { type: 'resign' })).toMatchObject({ ok: false });
  });

  it('cleanup removes idle rooms', () => {
    let now = 0;
    const rooms = new Rooms({ now: () => now });
    const a = rooms.create('Alice');
    now = 1000;
    rooms.cleanup(5000);
    expect(rooms.get(a.gameId)).toBeDefined();
    now = 10000;
    rooms.cleanup(5000);
    expect(rooms.get(a.gameId)).toBeUndefined();
  });

  describe('chat', () => {
    const setup = (opts: ConstructorParameters<typeof Rooms>[0] = {}) => {
      const rooms = new Rooms(opts);
      const a = rooms.create('Alice');
      return { rooms, a };
    };

    it('returns the trimmed message with the sender’s nickname, even before the opponent joins', () => {
      const { rooms, a } = setup();
      expect(rooms.chat(a.gameId, a.playerId, '  hello there  ')).toEqual({
        ok: true,
        message: { playerId: a.playerId, from: 'Alice', text: 'hello there' },
      });
    });

    it('rejects empty, over-long and foreign messages', () => {
      const { rooms, a } = setup();
      expect(rooms.chat(a.gameId, a.playerId, '   ')).toMatchObject({ ok: false });
      expect(rooms.chat(a.gameId, a.playerId, 'x'.repeat(201))).toMatchObject({ ok: false, error: expect.stringMatching(/200/) });
      expect(rooms.chat(a.gameId, a.playerId, 'x'.repeat(200))).toMatchObject({ ok: true });
      expect(rooms.chat(a.gameId, 'stranger', 'hi')).toMatchObject({ ok: false });
      expect(rooms.chat('zzzzzz', a.playerId, 'hi')).toMatchObject({ ok: false });
    });

    it('rate limits a flood but lets the sender talk again later', () => {
      let now = 0;
      const { rooms, a } = setup({ now: () => now });
      for (let i = 0; i < 5; i++) expect(rooms.chat(a.gameId, a.playerId, `m${i}`)).toMatchObject({ ok: true });
      expect(rooms.chat(a.gameId, a.playerId, 'too fast')).toMatchObject({ ok: false, error: expect.stringMatching(/slow/i) });
      now = 3500;
      expect(rooms.chat(a.gameId, a.playerId, 'later')).toMatchObject({ ok: true });
    });

    it('does not keep messages anywhere in the room', () => {
      const { rooms, a } = setup();
      rooms.chat(a.gameId, a.playerId, 'secret plans');
      expect(JSON.stringify(rooms.get(a.gameId), (_k, v) => (v instanceof Set ? [...v] : v))).not.toContain('secret plans');
    });
  });

  it('reports presence through snapshots', () => {
    const rooms = new Rooms();
    const a = rooms.create('Alice');
    const b = rooms.join(a.gameId, 'Bob');
    if (!b.ok) throw new Error('join failed');
    rooms.attach(a.gameId, a.playerId);
    const snap = rooms.snapshot(a.gameId, a.playerId);
    expect(snap).toMatchObject({ type: 'state', room: { connected: { [b.playerId]: false } } });
    rooms.attach(a.gameId, b.playerId);
    expect(rooms.snapshot(a.gameId, a.playerId)).toMatchObject({ room: { connected: { [b.playerId]: true } } });
    rooms.detach(a.gameId, b.playerId);
    expect(rooms.snapshot(a.gameId, a.playerId)).toMatchObject({ room: { connected: { [b.playerId]: false } } });
  });
});
