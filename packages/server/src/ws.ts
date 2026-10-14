import type { Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import type { Action, ClientMessage, PlayerId, ServerMessage } from '@isachess/engine';
import type { Rooms } from './rooms.js';

interface Client {
  ws: WebSocket;
  gameId: string;
  playerId: PlayerId;
}

const BAD = 'Bad message';

function parse(raw: string): ClientMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const m = data as Record<string, unknown>;
  switch (m.type) {
    case 'join':
      if (typeof m.gameId !== 'string') return null;
      if (m.nickname !== undefined && typeof m.nickname !== 'string') return null;
      if (m.seatToken !== undefined && typeof m.seatToken !== 'string') return null;
      return { type: 'join', gameId: m.gameId, nickname: (m.nickname as string | undefined) ?? '', seatToken: m.seatToken as string | undefined };
    case 'action':
      if (typeof m.action !== 'object' || m.action === null || typeof (m.action as { type?: unknown }).type !== 'string') return null;
      return { type: 'action', action: m.action as Action };
    case 'rematch':
      return { type: 'rematch' };
    case 'chat':
      return typeof m.text === 'string' ? { type: 'chat', text: m.text } : null;
    default:
      return null;
  }
}

export function attachWebSocket(server: Server, rooms: Rooms): WebSocketServer {
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });
  const clients = new Map<string, Set<Client>>();

  const send = (ws: WebSocket, msg: ServerMessage) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  };

  rooms.onChange((gameId) => {
    for (const client of clients.get(gameId) ?? []) {
      const snap = rooms.snapshot(gameId, client.playerId);
      if (snap) send(client.ws, snap);
    }
  });

  // ws raises 'error' for protocol violations (oversized or non-UTF-8 frames) and closes that socket itself;
  // without a listener Node would treat it as unhandled and take every game down with it.
  wss.on('error', () => {});

  wss.on('connection', (ws) => {
    let me: Client | null = null;
    ws.on('error', () => {});

    ws.on('message', (raw) => {
      const msg = parse(String(raw));
      if (!msg) return send(ws, { type: 'error', message: BAD });

      if (msg.type === 'join') {
        if (me) return send(ws, { type: 'error', message: 'Already joined.' });
        const result = rooms.join(msg.gameId, msg.nickname, msg.seatToken);
        if (!result.ok) return send(ws, { type: 'gone', reason: result.reason });
        me = { ws, gameId: msg.gameId, playerId: result.playerId };
        let set = clients.get(msg.gameId);
        if (!set) clients.set(msg.gameId, (set = new Set()));
        set.add(me);
        send(ws, { type: 'joined', gameId: msg.gameId, seatToken: result.seatToken, playerId: result.playerId });
        rooms.attach(msg.gameId, result.playerId);
        return;
      }
      if (!me) return send(ws, { type: 'error', message: 'Join a game first.' });
      if (msg.type === 'chat') {
        const chat = rooms.chat(me.gameId, me.playerId, msg.text);
        if (!chat.ok) return send(ws, { type: 'error', message: chat.error });
        for (const client of clients.get(me.gameId) ?? []) send(client.ws, { type: 'chat', message: chat.message });
        return;
      }
      const outcome = msg.type === 'action' ? rooms.act(me.gameId, me.playerId, msg.action) : rooms.rematch(me.gameId, me.playerId);
      if (!outcome.ok) send(ws, { type: 'error', message: outcome.error });
    });

    ws.on('close', () => {
      if (!me) return;
      clients.get(me.gameId)?.delete(me);
      rooms.detach(me.gameId, me.playerId);
    });
  });

  return wss;
}
