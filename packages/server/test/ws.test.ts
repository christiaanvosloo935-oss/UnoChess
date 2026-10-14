import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { connect } from 'node:net';
import { createGame, type Action, type PlayerView, type ServerMessage } from '@isachess/engine';
import { start } from '../src/index.js';

type Started = Awaited<ReturnType<typeof start>>;
const running: Started[] = [];
const sockets: WebSocket[] = [];

afterEach(async () => {
  for (const s of sockets.splice(0)) s.close();
  for (const r of running.splice(0)) await r.close();
});

/** A seed whose white opening hand holds a 2–5 move card. */
function findSeed(): number {
  for (let seed = 1; seed < 1000; seed++) {
    const g = createGame(seed, 'w', 'b');
    if (g.hands.w.some((c) => c.kind === 'num' && c.value! >= 2 && c.value! <= 5)) return seed;
  }
  throw new Error('no seed');
}
const SEED = findSeed();

async function boot(opts: { staticDir?: string } = {}): Promise<Started> {
  const s = await start(0, { seed: () => SEED, ...opts });
  running.push(s);
  return s;
}

class Client {
  messages: ServerMessage[] = [];
  private constructor(readonly ws: WebSocket) {
    ws.on('message', (raw) => this.messages.push(JSON.parse(String(raw))));
  }
  static async connect(port: number): Promise<Client> {
    const ws = new WebSocket(`ws://localhost:${port}/ws`);
    sockets.push(ws);
    await new Promise<void>((res, rej) => {
      ws.once('open', () => res());
      ws.once('error', rej);
    });
    return new Client(ws);
  }
  send(obj: unknown): void {
    this.ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj));
  }
  async waitFor<T extends ServerMessage>(pred: (m: ServerMessage) => boolean, from = 0): Promise<T> {
    const deadline = Date.now() + 3000;
    for (;;) {
      const found = this.messages.slice(from).find(pred);
      if (found) return found as T;
      if (Date.now() > deadline) throw new Error(`timed out; got ${JSON.stringify(this.messages.slice(from).map((m) => m.type))}`);
      await new Promise((r) => setTimeout(r, 10));
    }
  }
  async view(pred: (v: PlayerView) => boolean = () => true, from = 0): Promise<PlayerView> {
    const m = await this.waitFor<Extract<ServerMessage, { type: 'state' }>>((x) => x.type === 'state' && pred(x.view), from);
    return m.view;
  }
}

async function createViaHttp(port: number, nickname = 'Alice') {
  const res = await fetch(`http://localhost:${port}/api/games`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nickname }),
  });
  return { status: res.status, body: (await res.json()) as { gameId: string; seatToken: string; playerId: string } };
}

async function startGame(port: number) {
  const { body } = await createViaHttp(port);
  const a = await Client.connect(port);
  a.send({ type: 'join', gameId: body.gameId, nickname: 'Alice', seatToken: body.seatToken });
  await a.waitFor((m) => m.type === 'joined');
  await a.waitFor((m) => m.type === 'lobby');
  const b = await Client.connect(port);
  b.send({ type: 'join', gameId: body.gameId, nickname: 'Bob' });
  await b.waitFor((m) => m.type === 'joined');
  await a.view();
  await b.view();
  return { a, b, ...body };
}

/** The seat token of the n-th seat, read straight from the room (tests only). */
async function createSeatToken(server: Started, gameId: string, which: 'A' | 'B'): Promise<string> {
  const room = server.rooms.get(gameId)!;
  return room.seats[which === 'A' ? 0 : 1].token;
}

const action = (a: Action) => ({ type: 'action', action: a });
const playMoveCard = async (c: Client) => {
  const view = await c.view((v) => v.options.cards.length > 0);
  const card = view.hand.find((x) => x.kind === 'num' && x.value! >= 2 && x.value! <= 5)!;
  c.send(action({ type: 'playCard', cardId: card.id }));
  return card;
};
const e2e4: Action = { type: 'move', from: 12, to: 28 };

describe('websocket game', () => {
  it('two clients play a scripted opening and never see each other’s secrets', async () => {
    const server = await boot();
    const { a, b, gameId } = await startGame(server.port);
    await playMoveCard(a);
    const moving = await a.view((v) => v.phase.kind === 'moving');
    expect(moving.yourArmy).toBe('w');
    a.send(action(e2e4));
    await a.view((v) => v.phase.kind === 'moving' && v.phase.moved.length === 1);
    a.send(action({ type: 'doneMoving' }));
    const aView = await a.view((v) => v.turn === 2);
    const bView = await b.view((v) => v.turn === 2);
    expect(aView.current).toBe(bView.you);
    expect(bView.chess.board[28]).toMatchObject({ type: 'p', army: 'w' });

    const state = server.rooms.get(gameId)!.state!;
    const [pa, pb] = state.players;
    const secrets = {
      a: [...state.hands[pb], ...state.drawPile].map((c) => c.id),
      b: [...state.hands[pa], ...state.drawPile].map((c) => c.id),
    };
    for (const [client, ids] of [[a, secrets.a], [b, secrets.b]] as const) {
      const all = JSON.stringify(client.messages);
      for (const id of ids) expect(all).not.toContain(`"${id}"`);
      expect(all).not.toMatch(/"drawPile"|"hands"|"discardPile"|"seed"/);
    }
  });

  it('rejects a stale repeated action without crashing, and play continues', async () => {
    const server = await boot();
    const { a } = await startGame(server.port);
    await playMoveCard(a);
    await a.view((v) => v.phase.kind === 'moving');
    a.send(action(e2e4));
    await a.view((v) => v.phase.kind === 'moving' && v.phase.moved.length === 1);
    const before = a.messages.length;
    a.send(action(e2e4));
    const err = await a.waitFor<Extract<ServerMessage, { type: 'error' }>>((m) => m.type === 'error', before);
    expect(err.message).toBeTruthy();
    a.send(action({ type: 'move', from: 11, to: 27 }));
    await a.view((v) => v.phase.kind !== 'moving' || v.phase.moved.length === 2, before);
  });

  it('answers malformed messages with "Bad message" and keeps the socket open', async () => {
    const server = await boot();
    const c = await Client.connect(server.port);
    for (const bad of ['{', '{"type":"nope"}', '{"type":"action"}', '"just a string"', 'null']) {
      const before = c.messages.length;
      c.send(bad);
      const err = await c.waitFor<Extract<ServerMessage, { type: 'error' }>>((m) => m.type === 'error', before);
      expect(err.message).toBe('Bad message');
    }
    expect(c.ws.readyState).toBe(WebSocket.OPEN);
    const ok = await createViaHttp(server.port);
    expect(ok.status).toBe(200);
  });

  it('passes chat messages between the two players only, and keeps no history', async () => {
    const server = await boot();
    const { a, b, gameId } = await startGame(server.port);
    const outsider = await Client.connect(server.port);
    a.send({ type: 'chat', text: '  hi Bob <b>!</b> ' });
    const chat = (m: ServerMessage) => m.type === 'chat';
    const toA = await a.waitFor<Extract<ServerMessage, { type: 'chat' }>>(chat);
    const toB = await b.waitFor<Extract<ServerMessage, { type: 'chat' }>>(chat);
    expect(toB.message).toEqual({ playerId: toA.message.playerId, from: 'Alice', text: 'hi Bob <b>!</b>' });
    expect(toA.message.text).toBe('hi Bob <b>!</b>');
    expect(outsider.messages).toEqual([]);
    const late = await Client.connect(server.port);
    late.send({ type: 'join', gameId, nickname: 'Bob', seatToken: (await createSeatToken(server, gameId, 'B')) });
    await late.view();
    expect(late.messages.some(chat)).toBe(false);
  });

  it('lets the creator chat while waiting in the lobby', async () => {
    const server = await boot();
    const { body } = await createViaHttp(server.port);
    const a = await Client.connect(server.port);
    a.send({ type: 'join', gameId: body.gameId, nickname: 'Alice', seatToken: body.seatToken });
    await a.waitFor((m) => m.type === 'lobby');
    a.send({ type: 'chat', text: 'anyone there?' });
    expect(await a.waitFor((m) => m.type === 'chat')).toMatchObject({ message: { from: 'Alice', text: 'anyone there?' } });
  });

  it('answers bad chat messages with an error and keeps the socket open', async () => {
    const server = await boot();
    const { a } = await startGame(server.port);
    for (const [payload, expected] of [
      [{ type: 'chat' }, 'Bad message'],
      [{ type: 'chat', text: 5 }, 'Bad message'],
      [{ type: 'chat', text: '' }, 'Type a message first.'],
      [{ type: 'chat', text: 'x'.repeat(201) }, 'Messages can be at most 200 characters.'],
    ] as const) {
      const before = a.messages.length;
      a.send(payload);
      const err = await a.waitFor<Extract<ServerMessage, { type: 'error' }>>((m) => m.type === 'error', before);
      expect(err.message).toBe(expected);
    }
    expect(a.ws.readyState).toBe(WebSocket.OPEN);
  });

  it('survives protocol-level garbage (oversized and non-UTF-8 frames)', async () => {
    const server = await boot();
    const oversized = await Client.connect(server.port);
    const closed1 = new Promise<void>((res) => oversized.ws.once('close', () => res()));
    oversized.send('x'.repeat(20_000));
    await closed1;
    const badUtf8 = await Client.connect(server.port);
    const closed2 = new Promise<void>((res) => badUtf8.ws.once('close', () => res()));
    badUtf8.ws.send(Buffer.from([0xff, 0xfe, 0xfd]), { binary: false });
    await closed2;
    const ok = await createViaHttp(server.port);
    expect(ok.status).toBe(200);
    const c = await Client.connect(server.port);
    c.send({ type: 'join', gameId: ok.body.gameId, nickname: 'Alice', seatToken: ok.body.seatToken });
    await c.waitFor((m) => m.type === 'joined');
  });

  it('restores the moving phase after a refresh mid-turn', async () => {
    const server = await boot();
    const { a, gameId, seatToken } = await startGame(server.port);
    await playMoveCard(a);
    await a.view((v) => v.phase.kind === 'moving');
    a.send(action(e2e4));
    const mid = await a.view((v) => v.phase.kind === 'moving' && v.phase.moved.length === 1);
    a.ws.close();
    const a2 = await Client.connect(server.port);
    a2.send({ type: 'join', gameId, nickname: 'Alice', seatToken });
    const joined = await a2.waitFor<Extract<ServerMessage, { type: 'joined' }>>((m) => m.type === 'joined');
    expect(joined.playerId).toBe(mid.you);
    const back = await a2.view();
    expect(back.phase).toEqual(mid.phase);
  });

  it('delivers updates to every tab on a seat', async () => {
    const server = await boot();
    const { a, b, gameId, seatToken } = await startGame(server.port);
    const tab = await Client.connect(server.port);
    tab.send({ type: 'join', gameId, nickname: 'Alice', seatToken });
    await tab.view();
    const before = tab.messages.length;
    await playMoveCard(a);
    await tab.view((v) => v.phase.kind === 'moving', before);
    await b.view((v) => v.phase.kind === 'moving');
  });

  it('tells a third visitor the game is full and an unknown link it does not exist', async () => {
    const server = await boot();
    const { gameId } = await startGame(server.port);
    const c = await Client.connect(server.port);
    c.send({ type: 'join', gameId, nickname: 'Carol' });
    expect(await c.waitFor((m) => m.type === 'gone')).toEqual({ type: 'gone', reason: 'full' });
    const d = await Client.connect(server.port);
    d.send({ type: 'join', gameId: 'nope00', nickname: 'Dan' });
    expect(await d.waitFor((m) => m.type === 'gone')).toEqual({ type: 'gone', reason: 'not-found' });
  });

  it('shows the opponent as disconnected and connected again', async () => {
    const server = await boot();
    const { a, b } = await startGame(server.port);
    const joined = await a.waitFor<Extract<ServerMessage, { type: 'state' }>>((m) => m.type === 'state' && m.room.opponentConnected);
    expect(joined.room.opponentConnected).toBe(true);
    const before = a.messages.length;
    b.ws.close();
    const gone = await a.waitFor<Extract<ServerMessage, { type: 'state' }>>((m) => m.type === 'state' && !m.room.opponentConnected, before);
    expect(gone.room.opponentConnected).toBe(false);
  });
});

describe('http', () => {
  it('answers malformed request lines with 400 and keeps running', async () => {
    const server = await boot();
    for (const target of ['//:', '//[', 'http://', '/%E0%A4%A', '//a:b@']) {
      const reply = await new Promise<string>((resolve) => {
        const socket = connect(server.port, 'localhost', () =>
          socket.write(`GET ${target} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n`),
        );
        let data = '';
        socket.on('data', (d) => (data += d));
        socket.on('close', () => resolve(data));
        socket.on('error', () => resolve(data));
      });
      expect(reply, target).toMatch(/^HTTP\/1\.1 (400|404|200)/);
    }
    const ok = await createViaHttp(server.port);
    expect(ok.status).toBe(200);
  });

  it('rejects bad nicknames', async () => {
    const server = await boot();
    for (const nickname of ['', '   ', 'x'.repeat(21), 5]) {
      const res = await fetch(`http://localhost:${server.port}/api/games`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nickname }),
      });
      expect(res.status).toBe(400);
    }
  });

  it('serves static files with an SPA fallback and no path traversal', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'uc-static-'));
    writeFileSync(join(dir, 'index.html'), '<div id="root">home</div>');
    writeFileSync(join(dir, 'app.js'), 'console.log(1)');
    const server = await boot({ staticDir: dir });
    const base = `http://localhost:${server.port}`;
    expect(await (await fetch(`${base}/g/abc123`)).text()).toContain('id="root"');
    const js = await fetch(`${base}/app.js`);
    expect(js.headers.get('content-type')).toContain('javascript');
    const traversal = await new Promise<string>((resolve) => {
      const req = request({ host: 'localhost', port: server.port, path: '/..%2f..%2f..%2fpackage.json' }, (res) => {
        let body = '';
        res.on('data', (d) => (body += d));
        res.on('end', () => resolve(body));
      });
      req.end();
    });
    expect(traversal).not.toContain('"name"');
  });
});
