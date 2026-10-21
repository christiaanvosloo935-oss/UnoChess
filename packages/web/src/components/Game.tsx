import { useEffect, useState } from 'react';
import type { Army, ChatMessage, PieceColour, PlayerView, PromotionType, RoomInfo, Square } from '@isachess/engine';
import { chosenRole, highlights, prompt, step, type Selection, type UiEvent } from '../interaction';
import { geometryFor, type Action } from '@isachess/engine';
import { ARMY_NAME } from './ArmyName';
import { Board } from './Board';
import { CardGuide } from './CardGuide';
import { Chat } from './Chat';
import { CardBack, CardView } from './CardView';
import { HexBoard } from './HexBoard';
import { GameOver } from './GameOver';
import { PieceIcon } from './PieceIcon';
import { JokerPicker, PromotionPicker, RevivePicker, ShapeshiftPicker, TargetPicker } from './Pickers';
import { Toast } from './Toast';
import { COLOUR_HEX, DEFAULT_COLOURS } from '../pieceColours';

const IDLE: Selection = { kind: 'idle' };

interface Props {
  view: PlayerView;
  room: RoomInfo;
  send: (a: Action) => void;
  rematch: () => void;
  chat: ChatMessage[];
  me: string | null;
  sendChat: (text: string) => void;
  lastError: string | null;
  errorKey: number;
  clearError: () => void;
}

function statusText(view: PlayerView, room: RoomInfo, sel: Selection): string {
  const { phase } = view;
  if (phase.kind === 'over') return 'Game over';
  const mine = view.current === view.you;
  if (!mine) {
    const who = room.names[view.current] ?? 'Opponent';
    const army = view.opponents.find((o) => o.id === view.current)?.army;
    return view.variant === 'three' && army ? `${who}'s turn (${ARMY_NAME[army]})` : `${who}'s turn`;
  }
  const hint = prompt(view, sel);
  if (hint) return hint;
  if (phase.kind === 'moving') {
    const total = phase.moved.length + phase.movesLeft;
    return `Card ${total}: move ${phase.moved.length + 1} of ${total}${phase.mustMove ? ' (get out of check)' : ''}`;
  }
  if (view.inCheck.includes(view.yourArmy)) return 'You are in check! Play a card that escapes it, or any card as a 1.';
  return 'Your turn: play a card';
}

export function Game({ view, room, send, rematch, chat, me, sendChat, lastError, errorKey, clearError }: Props) {
  const [sel, setSel] = useState<Selection>(IDLE);
  const [tab, setTab] = useState<'chat' | 'cards'>('chat');
  const phaseKey = `${view.turn}:${view.phase.kind}:${view.phase.kind === 'moving' ? view.phase.movesLeft : ''}`;
  useEffect(() => setSel(IDLE), [phaseKey]);

  const dispatch = (ev: UiEvent) => {
    const result = step(view, sel, ev);
    setSel(result.sel);
    if (result.send) send(result.send);
  };

  const three = view.variant === 'three';
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
  const role = sel.kind === 'cardChosen' ? chosenRole(view, sel) : 'plain';
  const colours: Record<Army, PieceColour> = { ...DEFAULT_COLOURS };
  colours[view.yourArmy] = room.colours[view.you] ?? DEFAULT_COLOURS[view.yourArmy];
  for (const o of view.opponents) colours[o.army] = room.colours[o.id] ?? DEFAULT_COLOURS[o.army];
  const awaitingPromotion = (sel.kind === 'pieceChosen' && sel.to !== undefined) || (sel.kind === 'cardChosen' && sel.square !== undefined);
  const needsType = sel.kind === 'cardChosen' && role === 'shapeshift' && sel.picks[0] && !sel.as && sel.square === undefined;
  const needsJoker = sel.kind === 'cardChosen' && role === 'joker';
  const needsTarget = sel.kind === 'cardChosen' && role === 'targeted';
  const needsCaptured = sel.kind === 'cardChosen' && role === 'revive' && sel.capturedIndex === undefined;
  const name = (id: string) => room.names[id] ?? 'Player';
  const resign = () => {
    if (window.confirm('Resign this game?')) send({ type: 'resign' });
  };

  return (
    <div className="game">
      <div className="main">
        <div className="opponents">
          {view.opponents.map((o) => (
            <div key={o.id} className={`seat opponent${o.eliminated ? ' out' : ''}`} data-testid={`opponent-${o.id}`}>
              {three && <span className="army-dot" style={{ background: COLOUR_HEX[colours[o.army]] }} title={ARMY_NAME[o.army]} />}
              <strong>{name(o.id)}</strong>
              {o.hand ? <div className="revealed-cards" data-testid={`seen-hand-${o.id}`}>{o.hand.map((c) => <CardView key={c.id} card={c} disabled small />)}</div> : <CardBack count={o.handCount} />}
              {o.eliminated && <span className="badge-out">Eliminated</span>}
              {room.connected[o.id] === false && (
                <span className="offline">{three ? `${name(o.id)} disconnected` : 'Opponent disconnected, waiting…'}</span>
              )}
            </div>
          ))}
          {view.lastPlayed && (
            <div className="last-played" data-testid="last-played">
              <span className="muted">{view.lastPlayed.player === view.you ? 'You played' : `${name(view.lastPlayed.player)} played`}</span>
              <CardView card={view.lastPlayed.card} asOne={view.lastPlayed.asOne} disabled small />
            </div>
          )}
        </div>
        <p className={`status${view.inCheck.includes(view.yourArmy) ? ' alert' : ''}`} data-testid="status">
          {statusText(view, room, sel)}
        </p>
        {three ? (
          <HexBoard view={view} selectable={selectable} targets={targets} selected={selectedSquares} colours={colours} onSquare={(s) => dispatch({ type: 'clickSquare', sq: s })} />
        ) : (
          <Board view={view} selectable={selectable} targets={targets} selected={selectedSquares} colours={colours} onSquare={(s) => dispatch({ type: 'clickSquare', sq: s })} />
        )}
        <div className="seat me">
          <strong>{name(view.you)}</strong>
          <span className="muted">playing {ARMY_NAME[view.yourArmy]}</span>
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
          {geometryFor(view.variant).armies.map((army) => (
            <div key={army} className="muted">
              {ARMY_NAME[army]} lost: {view.captured[army].map((t, i) => <PieceIcon key={i} army={army} colour={colours[army]} type={t} className="small" />)}
            </div>
          ))}
        </div>
        <div className="tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === 'chat'} className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')} data-testid="tab-chat">Chat</button>
          <button type="button" role="tab" aria-selected={tab === 'cards'} className={tab === 'cards' ? 'active' : ''} onClick={() => setTab('cards')} data-testid="tab-cards">Cards</button>
        </div>
        <div hidden={tab !== 'chat'}><Chat messages={chat} me={me} onSend={sendChat} /></div>
        <div hidden={tab !== 'cards'}><CardGuide hand={view.hand} /></div>
        <ol className="log" data-testid="log">
          {[...view.log].reverse().map((e, i) => (
            <li key={`${e.turn}-${i}`}>{e.text === 'Check!' ? 'Check!' : `${name(e.player)} ${e.text}`}</li>
          ))}
        </ol>
        {view.phase.kind !== 'over' && <button type="button" className="secondary" onClick={resign}>Resign</button>}
      </aside>

      {awaitingPromotion && (
        <PromotionPicker army={view.yourArmy} colour={colours[view.yourArmy]} onPick={(p: PromotionType) => dispatch({ type: 'choosePromotion', p })} onCancel={() => dispatch({ type: 'cancel' })} />
      )}
      {needsJoker && card && (
        <JokerPicker view={view} card={card} onPick={(choice) => dispatch({ type: 'chooseJoker', choice })} onCancel={() => dispatch({ type: 'cancel' })} />
      )}
      {needsType && sel.kind === 'cardChosen' && (
        <ShapeshiftPicker view={view} colour={colours[view.yourArmy]} pieceId={sel.picks[0]} onPick={(t) => dispatch({ type: 'chooseType', as: t })} onCancel={() => dispatch({ type: 'cancel' })} />
      )}
      {needsTarget && (
        <TargetPicker view={view} names={room.names} colours={colours} onPick={(id) => dispatch({ type: 'chooseTarget', playerId: id })} onCancel={() => dispatch({ type: 'cancel' })} />
      )}
      {needsCaptured && (
        <RevivePicker view={view} colour={colours[view.yourArmy]} onPick={(index, asQueen) => dispatch({ type: 'chooseCaptured', index, asQueen })} onCancel={() => dispatch({ type: 'cancel' })} />
      )}
      <GameOver view={view} room={room} onRematch={rematch} />
      <Toast text={lastError} tick={errorKey} onDone={clearError} />
    </div>
  );
}
