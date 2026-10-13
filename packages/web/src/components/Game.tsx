import { useEffect, useState } from 'react';
import type { PlayerView, PromotionType, RoomInfo, Square } from '@unochess/engine';
import { highlights, prompt, roleOf, step, type Selection, type UiEvent } from '../interaction';
import type { Action } from '@unochess/engine';
import { Board } from './Board';
import { CardBack, CardView } from './CardView';
import { GameOver } from './GameOver';
import { PieceIcon } from './PieceIcon';
import { PromotionPicker, RevivePicker, ShapeshiftPicker } from './Pickers';
import { Toast } from './Toast';

const IDLE: Selection = { kind: 'idle' };

interface Props {
  view: PlayerView;
  room: RoomInfo;
  send: (a: Action) => void;
  rematch: () => void;
  lastError: string | null;
  errorKey: number;
  clearError: () => void;
}

function statusText(view: PlayerView, room: RoomInfo, sel: Selection): string {
  const { phase } = view;
  if (phase.kind === 'over') return 'Game over';
  const mine = view.current === view.you;
  if (!mine) return `${room.names[view.current] ?? 'Opponent'}'s turn`;
  const hint = prompt(view, sel);
  if (hint) return hint;
  if (phase.kind === 'moving') {
    const total = phase.moved.length + phase.movesLeft;
    return `Card ${total}: move ${phase.moved.length + 1} of ${total}${phase.mustMove ? ' (get out of check)' : ''}`;
  }
  if (view.inCheck === view.yourArmy) return 'You are in check! Play a card that escapes it, or any card as a 1.';
  return 'Your turn: play a card';
}

export function Game({ view, room, send, rematch, lastError, errorKey, clearError }: Props) {
  const [sel, setSel] = useState<Selection>(IDLE);
  const phaseKey = `${view.turn}:${view.phase.kind}:${view.phase.kind === 'moving' ? view.phase.movesLeft : ''}`;
  useEffect(() => setSel(IDLE), [phaseKey]);

  const dispatch = (ev: UiEvent) => {
    const result = step(view, sel, ev);
    setSel(result.sel);
    if (result.send) send(result.send);
  };

  const mine = view.current === view.you && view.phase.kind !== 'over';
  const { selectable, targets } = mine ? highlights(view, sel) : { selectable: [], targets: [] };
  const selectedSquares: Square[] = [];
  if (sel.kind === 'pieceChosen') selectedSquares.push(sel.from);
  if (sel.kind === 'cardChosen') {
    for (const id of sel.picks) {
      const at = view.chess.board.findIndex((p) => p?.id === id);
      if (at >= 0) selectedSquares.push(at);
    }
  }

  const card = sel.kind === 'cardChosen' ? view.hand.find((c) => c.id === sel.cardId) : undefined;
  const role = card ? roleOf(card) : 'plain';
  const awaitingPromotion = (sel.kind === 'pieceChosen' && sel.to !== undefined) || (sel.kind === 'cardChosen' && sel.square !== undefined);
  const needsType = sel.kind === 'cardChosen' && role === 'shapeshift' && sel.picks[0] && !sel.as && sel.square === undefined;
  const needsCaptured = sel.kind === 'cardChosen' && role === 'revive' && sel.capturedIndex === undefined;
  const name = (id: string) => room.names[id] ?? 'Player';
  const resign = () => {
    if (window.confirm('Resign this game?')) send({ type: 'resign' });
  };

  return (
    <div className="game">
      <div className="main">
        <div className="seat opponent">
          <strong>{name(view.opponent)}</strong>
          <CardBack count={view.opponentHandCount} />
          {!room.opponentConnected && <span className="offline">Opponent disconnected, waiting…</span>}
        </div>
        <p className={`status${view.inCheck === view.yourArmy ? ' alert' : ''}`} data-testid="status">
          {statusText(view, room, sel)}
        </p>
        <Board view={view} selectable={selectable} targets={targets} selected={selectedSquares} onSquare={(s) => dispatch({ type: 'clickSquare', sq: s })} />
        <div className="seat me">
          <strong>{name(view.you)}</strong>
          <span className="muted">playing {view.yourArmy === 'w' ? 'White' : 'Black'}</span>
          {view.options.canDoneMoving && (
            <button type="button" onClick={() => send({ type: 'doneMoving' })} data-testid="done-moving">Done moving</button>
          )}
          {sel.kind !== 'idle' && <button type="button" className="secondary" onClick={() => dispatch({ type: 'cancel' })}>Cancel</button>}
        </div>
        <div className="hand" data-testid="hand">
          {view.hand.map((c) => {
            const option = view.options.cards.find((o) => o.cardId === c.id);
            const asOne = !!option && !option.asEffect && option.asOne;
            const playable = mine && view.phase.kind === 'awaitingCard' && !!option && (option.asEffect || option.asOne);
            return (
              <CardView
                key={c.id}
                card={c}
                disabled={!playable}
                asOne={asOne}
                selected={sel.kind === 'cardChosen' && sel.cardId === c.id}
                onClick={() => dispatch({ type: 'clickCard', cardId: c.id, asOne })}
              />
            );
          })}
        </div>
      </div>
      <aside className="side">
        <div className="piles">
          <div><span className="muted">Draw pile</span><CardBack count={view.drawPileCount} /></div>
          <div><span className="muted">Discard</span>{view.topDiscard ? <CardView card={view.topDiscard} disabled small /> : <div className="card-empty" />}</div>
        </div>
        <div className="captured">
          {(['w', 'b'] as const).map((army) => (
            <div key={army} className="muted">
              {army === 'w' ? 'White' : 'Black'} lost: {view.captured[army].map((t, i) => <PieceIcon key={i} army={army} type={t} className="small" />)}
            </div>
          ))}
        </div>
        <ol className="log" data-testid="log">
          {[...view.log].reverse().map((e, i) => (
            <li key={`${e.turn}-${i}`}>{e.text === 'Check!' ? 'Check!' : `${name(e.player)} ${e.text}`}</li>
          ))}
        </ol>
        {view.phase.kind !== 'over' && <button type="button" className="secondary" onClick={resign}>Resign</button>}
      </aside>

      {awaitingPromotion && (
        <PromotionPicker army={view.yourArmy} onPick={(p: PromotionType) => dispatch({ type: 'choosePromotion', p })} onCancel={() => dispatch({ type: 'cancel' })} />
      )}
      {needsType && sel.kind === 'cardChosen' && (
        <ShapeshiftPicker view={view} pieceId={sel.picks[0]} onPick={(t) => dispatch({ type: 'chooseType', as: t })} onCancel={() => dispatch({ type: 'cancel' })} />
      )}
      {needsCaptured && (
        <RevivePicker view={view} onPick={(index, asQueen) => dispatch({ type: 'chooseCaptured', index, asQueen })} onCancel={() => dispatch({ type: 'cancel' })} />
      )}
      <GameOver view={view} room={room} onRematch={rematch} />
      <Toast text={lastError} tick={errorKey} onDone={clearError} />
    </div>
  );
}
