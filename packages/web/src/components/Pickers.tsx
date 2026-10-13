import type { PieceType, PlayerView, PromotionType } from '@unochess/engine';
import { PIECE_NAME } from './pieceNames';
import { PieceIcon } from './PieceIcon';

function Modal({ title, children, onCancel }: { title: string; children: React.ReactNode; onCancel: () => void }) {
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-label={title}>
        <h3>{title}</h3>
        <div className="choices">{children}</div>
        <button type="button" className="secondary" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

export function PromotionPicker({ army, onPick, onCancel }: { army: 'w' | 'b'; onPick: (p: PromotionType) => void; onCancel: () => void }) {
  return (
    <Modal title="Promote to…" onCancel={onCancel}>
      {(['q', 'r', 'b', 'n'] as const).map((p) => (
        <button key={p} type="button" className="choice" onClick={() => onPick(p)} data-testid={`promote-${p}`}>
          <PieceIcon army={army} type={p} />
          {PIECE_NAME[p]}
        </button>
      ))}
    </Modal>
  );
}

export function ShapeshiftPicker({ view, pieceId, onPick, onCancel }: { view: PlayerView; pieceId: string; onPick: (t: PieceType) => void; onCancel: () => void }) {
  const types = [...new Set(view.options.shapeshifts.filter((s) => s.pieceId === pieceId).map((s) => s.as))];
  return (
    <Modal title="Move like a…" onCancel={onCancel}>
      {types.map((t) => (
        <button key={t} type="button" className="choice" onClick={() => onPick(t)} data-testid={`shape-${t}`}>
          <PieceIcon army={view.yourArmy} type={t} />
          {PIECE_NAME[t]}
        </button>
      ))}
    </Modal>
  );
}

export function RevivePicker({ view, onPick, onCancel }: { view: PlayerView; onPick: (index: number, asQueen: boolean) => void; onCancel: () => void }) {
  const seen = new Set<string>();
  const choices = view.options.revives.filter((r) => {
    const key = `${view.captured[view.yourArmy][r.capturedIndex]}:${r.asQueen}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return (
    <Modal title="Revive which piece?" onCancel={onCancel}>
      {choices.map((r) => {
        const type = r.asQueen ? 'q' : view.captured[view.yourArmy][r.capturedIndex];
        return (
          <button key={`${r.capturedIndex}:${r.asQueen}`} type="button" className="choice" onClick={() => onPick(r.capturedIndex, r.asQueen)} data-testid={`revive-${r.capturedIndex}-${r.asQueen ? 'q' : 'n'}`}>
            <PieceIcon army={view.yourArmy} type={type} />
            {r.asQueen ? 'Pawn → Queen' : PIECE_NAME[type]}
          </button>
        );
      })}
    </Modal>
  );
}
