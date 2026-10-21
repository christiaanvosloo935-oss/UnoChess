import { useEffect, useState } from 'react';

/** Counts down to the end of the turn, from the time left the server last reported. */
export function TurnTimer({ msLeft, stamp }: { msLeft: number | null; stamp: unknown }) {
  const [now, setNow] = useState(() => Date.now());
  const [end, setEnd] = useState<number | null>(null);

  // Every state update from the server carries the time left; restart from it.
  useEffect(() => {
    setEnd(msLeft === null ? null : Date.now() + msLeft);
    setNow(Date.now());
  }, [msLeft, stamp]);

  useEffect(() => {
    if (end === null) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [end]);

  if (end === null) return null;
  const seconds = Math.max(0, Math.ceil((end - now) / 1000));
  const text = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  return (
    <div className={`turn-timer${seconds <= 10 ? ' low' : ''}`} data-testid="turn-timer" role="timer" aria-label={`${seconds} seconds left in this turn`}>
      <span aria-hidden="true">⏱</span> {text}
    </div>
  );
}
