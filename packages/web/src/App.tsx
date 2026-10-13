import { useCallback, useEffect, useState } from 'react';
import { Chat } from './components/Chat';
import { Game } from './components/Game';
import { Home } from './components/Home';
import { useGame } from './useGame';
import { getNickname, getSeat, saveNickname } from './seat';

function usePath(): [string, (path: string) => void] {
  const [path, setPath] = useState(location.pathname);
  useEffect(() => {
    const onPop = () => setPath(location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);
  const go = useCallback((next: string) => {
    history.pushState(null, '', next);
    setPath(next);
  }, []);
  return [path, go];
}

function NicknamePrompt({ onDone }: { onDone: (nick: string) => void }) {
  const [nick, setNick] = useState(getNickname());
  return (
    <main className="home">
      <h1>Uno Chess</h1>
      <p className="tagline">You've been invited to a game.</p>
      <form onSubmit={(e) => { e.preventDefault(); if (nick.trim()) onDone(nick.trim()); }}>
        <label>
          Your nickname
          <input value={nick} maxLength={20} autoFocus onChange={(e) => setNick(e.target.value)} data-testid="nickname" />
        </label>
        <button type="submit" data-testid="join-game">Join game</button>
      </form>
    </main>
  );
}

function GameRoute({ gameId, go }: { gameId: string; go: (path: string) => void }) {
  const [nickname, setNickname] = useState<string | null>(() => (getSeat(gameId) || getNickname() ? getNickname() : null));
  const { conn, send, rematch, chat, me, sendChat, lastError, errorKey, clearError } = useGame(gameId, nickname);

  useEffect(() => {
    if (conn.status === 'gone' && conn.reason === 'not-found') go('/?note=gone');
  }, [conn, go]);

  if (nickname === null) {
    return <NicknamePrompt onDone={(n) => { saveNickname(n); setNickname(n); }} />;
  }
  switch (conn.status) {
    case 'connecting':
    case 'reconnecting':
      return <main className="home"><p>{conn.status === 'connecting' ? 'Connecting…' : 'Connection lost. Reconnecting…'}</p></main>;
    case 'gone':
      return <main className="home"><h1>Uno Chess</h1><p>This game is full.</p><a href="/">Start your own game</a></main>;
    case 'lobby': {
      const link = `${location.origin}/g/${gameId}`;
      return (
        <main className="home">
          <h1>Waiting for your friend…</h1>
          <p>Send them this link:</p>
          <input readOnly value={link} data-testid="copy-link" onFocus={(e) => e.target.select()} />
          <button onClick={() => navigator.clipboard?.writeText(link)}>Copy link</button>
          <Chat messages={chat} me={me} onSend={sendChat} />
        </main>
      );
    }
    case 'playing':
      return <Game view={conn.view} room={conn.room} send={send} rematch={rematch} chat={chat} me={me} sendChat={sendChat} lastError={lastError} errorKey={errorKey} clearError={clearError} />;
  }
}

export function App() {
  const [path, go] = usePath();
  const match = /^\/g\/([a-z0-9]+)\/?$/i.exec(path);
  if (match) return <GameRoute key={match[1]} gameId={match[1]} go={go} />;
  const note = new URLSearchParams(location.search).get('note') === 'gone' ? "That game doesn't exist any more." : undefined;
  return <Home note={note} go={go} />;
}
