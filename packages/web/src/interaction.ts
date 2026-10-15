import type { Action, Card, EffectArgs, PieceType, PlayerId, PlayerView, PromotionType, Square } from '@isachess/engine';

export type Selection =
  | { kind: 'idle' }
  | {
      kind: 'cardChosen';
      cardId: string;
      asOne: boolean;
      picks: string[]; // piece ids picked so far (swap: up to 2; shapeshift: the piece)
      square?: Square; // shapeshift destination awaiting a promotion choice
      as?: PieceType;
      capturedIndex?: number;
      asQueen?: boolean;
    }
  | { kind: 'pieceChosen'; from: Square; to?: Square }; // `to` is set while a promotion piece is awaited

export type UiEvent =
  | { type: 'clickCard'; cardId: string; asOne: boolean }
  | { type: 'clickSquare'; sq: Square }
  | { type: 'chooseType'; as: PieceType }
  | { type: 'chooseTarget'; playerId: PlayerId }
  | { type: 'chooseCaptured'; index: number; asQueen: boolean }
  | { type: 'choosePromotion'; p: PromotionType }
  | { type: 'cancel' };

export interface StepResult {
  sel: Selection;
  send?: Action;
  needPromotion?: { from: Square; to: Square };
}

const IDLE: Selection = { kind: 'idle' };

type Role = 'plain' | 'swap' | 'freeze' | 'shield' | 'shapeshift' | 'revive' | 'targeted';
type Chosen = Extract<Selection, { kind: 'cardChosen' }>;

export function roleOf(card: Card): Role {
  if (card.kind === 'skip') return 'shield';
  if (card.kind === 'wild') return 'revive';
  if (card.kind === 'num') {
    if (card.value === 6) return 'swap';
    if (card.value === 7) return 'freeze';
    if (card.value === 8) return 'shapeshift';
    if (card.value === 9) return 'targeted';
  }
  if (card.kind === 'reverse' || card.kind === 'draw2' || card.kind === 'wild4') return 'targeted';
  return 'plain';
}

const squareOf = (view: PlayerView, id: string): Square => view.chess.board.findIndex((p) => p?.id === id);
const idAt = (view: PlayerView, sq: Square): string | undefined => view.chess.board[sq]?.id;
const playCard = (cardId: string, extra: { asOne?: true; args?: EffectArgs } = {}): Action => ({ type: 'playCard', cardId, ...extra });

function chosenRole(view: PlayerView, sel: Chosen): Role {
  const card = view.hand.find((c) => c.id === sel.cardId);
  return card ? roleOf(card) : 'plain';
}

function clickCard(view: PlayerView, sel: Selection, cardId: string, asOne: boolean): StepResult {
  if (view.phase.kind !== 'awaitingCard' || view.current !== view.you) return { sel };
  if (sel.kind === 'cardChosen' && sel.cardId === cardId) return { sel: IDLE };
  const card = view.hand.find((c) => c.id === cardId);
  const option = view.options.cards.find((o) => o.cardId === cardId);
  if (!card || !option) return { sel };
  if (asOne ? !option.asOne : !option.asEffect) return { sel };
  if (asOne) return { sel: IDLE, send: playCard(cardId, { asOne: true }) };
  const o = view.options;
  if (roleOf(card) === 'targeted') {
    // One opponent left: the engine fills the target in. Two or more: ask which.
    return o.targets.length >= 2 ? { sel: { kind: 'cardChosen', cardId, asOne: false, picks: [] } } : { sel: IDLE, send: playCard(cardId) };
  }
  const needsTarget =
    { plain: false, swap: o.swaps.length > 0, freeze: o.freezeTargets.length > 0, shield: o.shieldTargets.length > 0,
      shapeshift: o.shapeshifts.length > 0, revive: o.revives.length > 0, targeted: false }[roleOf(card)];
  if (!needsTarget) return { sel: IDLE, send: playCard(cardId) };
  return { sel: { kind: 'cardChosen', cardId, asOne: false, picks: [] } };
}

function clickSquareMoving(view: PlayerView, sel: Selection, sq: Square): StepResult {
  const moves = view.options.moves;
  if (sel.kind === 'pieceChosen') {
    if (sel.to !== undefined) return { sel }; // waiting for a promotion choice
    if (sq === sel.from) return { sel: IDLE };
    const candidates = moves.filter((m) => m.from === sel.from && m.to === sq);
    if (candidates.some((m) => m.promotion)) {
      return { sel: { kind: 'pieceChosen', from: sel.from, to: sq }, needPromotion: { from: sel.from, to: sq } };
    }
    if (candidates.length > 0) return { sel: IDLE, send: { type: 'move', from: sel.from, to: sq } };
  }
  if (moves.some((m) => m.from === sq)) return { sel: { kind: 'pieceChosen', from: sq } };
  return { sel: sel.kind === 'pieceChosen' && sel.to === undefined ? IDLE : sel };
}

function clickSquareCard(view: PlayerView, sel: Chosen, sq: Square): StepResult {
  const id = idAt(view, sq);
  const o = view.options;
  const send = (args: EffectArgs): StepResult => ({ sel: IDLE, send: playCard(sel.cardId, { args }) });
  switch (chosenRole(view, sel)) {
    case 'swap': {
      if (!id) return { sel };
      const first = sel.picks[0];
      if (first === id) return { sel: { ...sel, picks: [] } };
      const paired = (a: string, b: string) => o.swaps.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
      if (first && paired(first, id)) return send({ type: 'swap', a: first, b: id });
      if (o.swaps.some(([x, y]) => x === id || y === id)) return { sel: { ...sel, picks: [id] } };
      return { sel };
    }
    case 'freeze':
      return id && o.freezeTargets.includes(id) ? send({ type: 'freeze', pieceId: id }) : { sel };
    case 'shield':
      return id && o.shieldTargets.includes(id) ? send({ type: 'shield', pieceId: id }) : { sel };
    case 'shapeshift': {
      if (sel.square !== undefined) return { sel }; // waiting for a promotion choice
      const piece = sel.picks[0];
      if (piece && sel.as) {
        const hits = o.shapeshifts.filter((s) => s.pieceId === piece && s.as === sel.as && s.to === sq);
        if (hits.some((s) => s.promotion)) {
          return { sel: { ...sel, square: sq }, needPromotion: { from: squareOf(view, piece), to: sq } };
        }
        if (hits.length > 0) return send({ type: 'shapeshift', pieceId: piece, as: sel.as, to: sq });
      }
      if (id && o.shapeshifts.some((s) => s.pieceId === id)) return { sel: { ...sel, picks: [id], as: undefined } };
      return { sel };
    }
    case 'revive': {
      if (sel.capturedIndex === undefined) return { sel };
      const hit = o.revives.some((r) => r.capturedIndex === sel.capturedIndex && r.asQueen === !!sel.asQueen && r.square === sq);
      return hit ? send({ type: 'revive', capturedIndex: sel.capturedIndex, square: sq, asQueen: !!sel.asQueen }) : { sel };
    }
    default:
      return { sel };
  }
}

export function step(view: PlayerView, sel: Selection, ev: UiEvent): StepResult {
  if (ev.type === 'cancel') return { sel: IDLE };
  if (view.phase.kind === 'over' || view.current !== view.you) return { sel };
  switch (ev.type) {
    case 'clickCard':
      return clickCard(view, sel, ev.cardId, ev.asOne);
    case 'clickSquare':
      if (view.phase.kind === 'moving') return clickSquareMoving(view, sel, ev.sq);
      return sel.kind === 'cardChosen' ? clickSquareCard(view, sel, ev.sq) : { sel };
    case 'chooseType':
      if (sel.kind === 'cardChosen' && sel.picks[0] && view.options.shapeshifts.some((s) => s.pieceId === sel.picks[0] && s.as === ev.as)) {
        return { sel: { ...sel, as: ev.as } };
      }
      return { sel };
    case 'chooseTarget':
      if (sel.kind === 'cardChosen' && chosenRole(view, sel) === 'targeted' && view.options.targets.includes(ev.playerId)) {
        return { sel: IDLE, send: { type: 'playCard', cardId: sel.cardId, target: ev.playerId } };
      }
      return { sel };
    case 'chooseCaptured':
      if (sel.kind === 'cardChosen' && view.options.revives.some((r) => r.capturedIndex === ev.index && r.asQueen === ev.asQueen)) {
        return { sel: { ...sel, capturedIndex: ev.index, asQueen: ev.asQueen } };
      }
      return { sel };
    case 'choosePromotion':
      if (sel.kind === 'pieceChosen' && sel.to !== undefined) {
        return { sel: IDLE, send: { type: 'move', from: sel.from, to: sel.to, promotion: ev.p } };
      }
      if (sel.kind === 'cardChosen' && sel.square !== undefined && sel.picks[0] && sel.as) {
        return {
          sel: IDLE,
          send: playCard(sel.cardId, {
            args: { type: 'shapeshift', pieceId: sel.picks[0], as: sel.as, to: sel.square, promotion: ev.p },
          }),
        };
      }
      return { sel };
  }
}

const squaresOfIds = (view: PlayerView, ids: Iterable<string>): Square[] => {
  const wanted = new Set(ids);
  return view.chess.board.flatMap((p, sq) => (p && wanted.has(p.id) ? [sq] : []));
};

/** Squares to mark as clickable pieces and as destination targets for the current selection. */
export function highlights(view: PlayerView, sel: Selection): { selectable: Square[]; targets: Square[] } {
  const o = view.options;
  if (view.phase.kind === 'moving') {
    const froms = [...new Set(o.moves.map((m) => m.from))];
    if (sel.kind === 'pieceChosen') {
      return { selectable: froms, targets: [...new Set(o.moves.filter((m) => m.from === sel.from).map((m) => m.to))] };
    }
    return { selectable: froms, targets: [] };
  }
  if (sel.kind !== 'cardChosen') return { selectable: [], targets: [] };
  const first = sel.picks[0];
  switch (chosenRole(view, sel)) {
    case 'swap': {
      const pairs = o.swaps;
      const partners = first ? pairs.filter(([a, b]) => a === first || b === first).map(([a, b]) => (a === first ? b : a)) : [];
      return { selectable: squaresOfIds(view, pairs.flat()), targets: squaresOfIds(view, partners) };
    }
    case 'freeze':
      return { selectable: squaresOfIds(view, o.freezeTargets), targets: [] };
    case 'shield':
      return { selectable: squaresOfIds(view, o.shieldTargets), targets: [] };
    case 'shapeshift': {
      const targets = first && sel.as
        ? o.shapeshifts.filter((s) => s.pieceId === first && s.as === sel.as).map((s) => s.to)
        : [];
      return { selectable: squaresOfIds(view, o.shapeshifts.map((s) => s.pieceId)), targets: [...new Set(targets)] };
    }
    case 'revive': {
      const targets = sel.capturedIndex === undefined
        ? []
        : o.revives.filter((r) => r.capturedIndex === sel.capturedIndex && r.asQueen === !!sel.asQueen).map((r) => r.square);
      return { selectable: [], targets };
    }
    default:
      return { selectable: [], targets: [] };
  }
}

/** One-line instruction for the step the player is on, or null when there is none. */
export function prompt(view: PlayerView, sel: Selection): string | null {
  if (sel.kind === 'pieceChosen') return sel.to !== undefined ? 'Choose a promotion piece' : null;
  if (sel.kind !== 'cardChosen') return null;
  switch (chosenRole(view, sel)) {
    case 'swap': return sel.picks.length === 0 ? 'Swap: pick two of your pieces' : 'Swap: pick the second piece';
    case 'freeze': return 'Freeze: pick an enemy piece';
    case 'shield': return 'Shield: pick one of your pieces (not the king)';
    case 'shapeshift':
      if (sel.square !== undefined) return 'Choose a promotion piece';
      if (sel.picks.length === 0) return 'Shapeshift: pick one of your pieces';
      return sel.as ? 'Shapeshift: pick a destination' : 'Shapeshift: choose the piece type to move like';
    case 'revive':
      return sel.capturedIndex === undefined ? 'Revive: choose a captured piece' : 'Revive: pick an empty square in your first two rows';
    case 'targeted': return 'Choose which opponent';
    default: return null;
  }
}
