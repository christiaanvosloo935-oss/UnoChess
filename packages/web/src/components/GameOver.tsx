import type { PlayerView, RoomInfo } from '@isachess/engine';

export function GameOver({ view, room, onRematch }: { view: PlayerView; room: RoomInfo; onRematch: () => void }) {
  if (view.phase.kind !== 'over') return null;
  const { winner, reason } = view.phase;
  const title = winner === null ? 'Draw' : winner === view.you ? 'You win!' : `${room.names[winner]} wins`;
  const why = { checkmate: 'Checkmate', stalemate: 'Stalemate', resign: 'Resignation' }[reason];
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-label="Game over">
        <h2 data-testid="result">{title}</h2>
        <p>{why}</p>
        {room.rematch[view.opponents[0].id] && !room.rematch[view.you] && <p>Your opponent wants a rematch.</p>}
        <button type="button" onClick={onRematch} disabled={room.rematch[view.you]} data-testid="rematch">
          {room.rematch[view.you] ? 'Waiting for opponent…' : 'Rematch'}
        </button>
      </div>
    </div>
  );
}
