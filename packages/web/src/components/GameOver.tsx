import type { PlayerView, RoomInfo } from '@isachess/engine';

export function GameOver({ view, room, onRematch }: { view: PlayerView; room: RoomInfo; onRematch: () => void }) {
  if (view.phase.kind !== 'over') return null;
  const { winner, reason } = view.phase;
  const title = winner === null ? 'Draw' : winner === view.you ? 'You win!' : `${room.names[winner]} wins`;
  const why = { checkmate: 'Checkmate', stalemate: 'Stalemate', resign: 'Resignation' }[reason];
  const three = view.opponents.length > 1;
  const seated = [view.you, ...view.opponents.map((o) => o.id)];
  const voted = seated.filter((id) => room.rematch[id]);
  const waiting = seated.length - voted.length;
  const iVoted = !!room.rematch[view.you];
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-label="Game over">
        <h2 data-testid="result">{title}</h2>
        <p>{why}</p>
        {!three && room.rematch[view.opponents[0].id] && !iVoted && <p>Your opponent wants a rematch.</p>}
        {three && voted.length > 0 && (
          <p data-testid="rematch-votes">Rematch: {voted.map((id) => (id === view.you ? 'You' : room.names[id] ?? 'Player')).join(', ')}</p>
        )}
        {three && iVoted && waiting > 0 && <p>Waiting for {waiting} more to vote</p>}
        <button type="button" onClick={onRematch} disabled={iVoted} data-testid="rematch">
          {iVoted ? (three ? 'Waiting for others…' : 'Waiting for opponent…') : 'Rematch'}
        </button>
      </div>
    </div>
  );
}
