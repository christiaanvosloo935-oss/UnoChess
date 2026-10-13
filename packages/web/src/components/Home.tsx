import { useState } from 'react';
import { createGame } from '../api';
import { getNickname, saveNickname, setSeat } from '../seat';

export function Home({ note, go }: { note?: string; go: (path: string) => void }) {
  const [nick, setNick] = useState(getNickname());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    const name = nick.trim();
    if (!name) return setError('Please enter a nickname.');
    setBusy(true);
    setError(null);
    try {
      const game = await createGame(name);
      saveNickname(name);
      setSeat(game.gameId, game.seatToken);
      go(`/g/${game.gameId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
      setBusy(false);
    }
  };

  return (
    <main className="home">
      <h1>Uno Chess</h1>
      <p className="tagline">Chess, but the cards decide how you move.</p>
      {note && <p className="note">{note}</p>}
      <form onSubmit={(e) => { e.preventDefault(); void create(); }}>
        <label>
          Your nickname
          <input value={nick} maxLength={20} autoFocus onChange={(e) => setNick(e.target.value)} data-testid="nickname" />
        </label>
        <button type="submit" disabled={busy} data-testid="new-game">New game</button>
      </form>
      {error && <p className="error">{error}</p>}
    </main>
  );
}
