import { useState } from 'react';
import { createGame } from '../api';
import { Brand } from './Brand';
import { CardGuideModal } from './CardGuide';
import { getColour, getNickname, saveColour, saveNickname, setSeat } from '../seat';
import { ColourPicker } from './ColourPicker';

export function Home({ note, go }: { note?: string; go: (path: string) => void }) {
  const [nick, setNick] = useState(getNickname());
  const [colour, setColour] = useState(getColour());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guide, setGuide] = useState(false);

  const create = async () => {
    const name = nick.trim();
    if (!name) return setError('Please enter a nickname.');
    setBusy(true);
    setError(null);
    try {
      const game = await createGame(name, colour);
      saveNickname(name);
      saveColour(colour);
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
      <form onSubmit={(e) => { e.preventDefault(); void create(); }}>
        <label>
          Your nickname
          <input value={nick} maxLength={20} autoFocus onChange={(e) => setNick(e.target.value)} data-testid="nickname" />
        </label>
        <ColourPicker value={colour} onChange={setColour} />
        <button type="submit" disabled={busy} data-testid="new-game">New game</button>
      </form>
      {error && <p className="error">{error}</p>}
      <button type="button" className="secondary" onClick={() => setGuide(true)} data-testid="home-guide">How the cards work</button>
      {guide && <CardGuideModal onClose={() => setGuide(false)} />}
    </main>
  );
}
