import { useState } from 'react';
import type { Variant } from '@isachess/engine';
import { createGame } from '../api';
import { Brand } from './Brand';
import { CardGuideModal } from './CardGuide';
import { getNickname, saveNickname, setSeat } from '../seat';

export function Home({ note, go }: { note?: string; go: (path: string) => void }) {
  const [nick, setNick] = useState(getNickname());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guide, setGuide] = useState(false);

  const create = async (variant: Variant) => {
    const name = nick.trim();
    if (!name) return setError('Please enter a nickname.');
    setBusy(true);
    setError(null);
    try {
      const game = await createGame(name, variant);
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
      <Brand />
      <p className="tagline">Chess, but the cards decide how you move.</p>
      {note && <p className="note">{note}</p>}
      <form onSubmit={(e) => { e.preventDefault(); void create('classic'); }}>
        <label>
          Your nickname
          <input value={nick} maxLength={20} autoFocus onChange={(e) => setNick(e.target.value)} data-testid="nickname" />
        </label>
        <div className="start-buttons">
          <button type="submit" disabled={busy} data-testid="new-game">2-player game</button>
          <button type="button" disabled={busy} onClick={() => void create('three')} data-testid="new-game-3">3-player game</button>
        </div>
      </form>
      {error && <p className="error">{error}</p>}
      <button type="button" className="secondary" onClick={() => setGuide(true)} data-testid="home-guide">How the cards work</button>
      {guide && <CardGuideModal onClose={() => setGuide(false)} />}
    </main>
  );
}
