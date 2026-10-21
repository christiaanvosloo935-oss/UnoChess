import { useCallback, useEffect, useRef, useState } from 'react';
import type { Action, ChatMessage, PieceColour, PlayerView, RoomInfo, ServerMessage } from '@isachess/engine';
import { getSeat, setSeat } from './seat';

export type GameConn =
  | { status: 'connecting' | 'reconnecting' }
  | { status: 'lobby'; names: string[]; colours: PieceColour[]; needed: number }
  | { status: 'playing'; view: PlayerView; room: RoomInfo }
  | { status: 'gone'; reason: 'not-found' | 'full' };

const BACKOFF_MS = [1000, 2000, 4000, 8000];
const CHAT_KEEP = 100;

export function useGame(gameId: string, nickname: string | null, colour: PieceColour) {
  const [conn, setConn] = useState<GameConn>({ status: 'connecting' });
  const [error, setError] = useState<{ text: string; n: number } | null>(null);
  const [chat, setChat] = useState<ChatMessage[]>([]);
  const [me, setMe] = useState<string | null>(null);
  const socket = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (nickname === null) return;
    let stopped = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${location.host}/ws`);
      socket.current = ws;
      ws.onopen = () => {
        attempt = 0;
        ws.send(JSON.stringify({ type: 'join', gameId, nickname, colour, seatToken: getSeat(gameId) }));
      };
      ws.onmessage = (ev) => {
        const msg = JSON.parse(String(ev.data)) as ServerMessage;
        switch (msg.type) {
          case 'joined': setSeat(gameId, msg.seatToken); setMe(msg.playerId); break;
          case 'chat': setChat((c) => [...c, msg.message].slice(-CHAT_KEEP)); break;
          case 'lobby': setConn({ status: 'lobby', names: msg.names, colours: msg.colours, needed: msg.needed }); break;
          case 'state': setConn({ status: 'playing', view: msg.view, room: msg.room }); break;
          case 'error': setError((e) => ({ text: msg.message, n: (e?.n ?? 0) + 1 })); break;
          case 'gone':
            stopped = true;
            setConn({ status: 'gone', reason: msg.reason });
            break;
        }
      };
      ws.onclose = () => {
        if (stopped) return;
        setConn({ status: 'reconnecting' });
        timer = setTimeout(connect, BACKOFF_MS[Math.min(attempt++, BACKOFF_MS.length - 1)]);
      };
    };

    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      socket.current?.close();
    };
  }, [gameId, nickname]); // colour is only sent when first joining, so later picks don't reconnect

  const sendRaw = useCallback((msg: unknown) => {
    if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify(msg));
  }, []);
  const send = useCallback((action: Action) => sendRaw({ type: 'action', action }), [sendRaw]);
  const rematch = useCallback(() => sendRaw({ type: 'rematch' }), [sendRaw]);
  const sendChat = useCallback((text: string) => sendRaw({ type: 'chat', text }), [sendRaw]);
  const clearError = useCallback(() => setError(null), []);

  return { conn, send, rematch, chat, me, sendChat, lastError: error?.text ?? null, errorKey: error?.n ?? 0, clearError };
}
