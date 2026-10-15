import { useLayoutEffect, useMemo, useRef } from 'react';
import type { Effects, PlayerView, Square } from '@isachess/engine';
import { exhaustedPieces, geometryFor } from '@isachess/engine';
import { diffBoards, newEffects, shouldAnimate, type BoardMeta } from '../animation';
import { playTransition, prefersReducedMotion } from '../animatePieces';
import { layoutHex } from '../hexLayout';
import { PieceIcon } from './PieceIcon';

interface Props {
  view: PlayerView;
  selectable: Square[];
  targets: Square[];
  selected: Square[];
  onSquare: (sq: Square) => void;
}

const pct = (n: number) => `${+n.toFixed(3)}%`;

/** The three-player board: 96 squares drawn as six skewed blocks around the centre (see hexLayout). */
export function HexBoard({ view, selectable, targets, selected, onSquare }: Props) {
  const { chess, yourArmy, effects, phase } = view;
  const boardRef = useRef<HTMLDivElement>(null);
  const previous = useRef<{ board: PlayerView['chess']['board']; effects: Effects; meta: BoardMeta } | null>(null);
  const geo = geometryFor('three');
  const layout = useMemo(() => layoutHex(yourArmy), [yourArmy]);

  useLayoutEffect(() => {
    const meta: BoardMeta = { army: view.yourArmy, turn: view.turn };
    const before = previous.current;
    previous.current = { board: view.chess.board, effects: view.effects, meta };
    if (!before || !boardRef.current || !shouldAnimate(before.meta, meta) || prefersReducedMotion()) return;
    playTransition(boardRef.current, diffBoards(before.board, view.chess.board), newEffects(before.effects, view.effects));
  }, [view.chess.board, view.effects, view.yourArmy, view.turn]);

  const frozen = new Set(effects.frozen.map((f) => f.pieceId));
  const shielded = new Set(effects.shields.map((s) => s.pieceId));
  const moved = exhaustedPieces(phase.kind === 'moving' ? phase.moved : []); // greyed out once a piece used its two moves
  const checked = new Set<Square>();
  for (const army of view.inCheck) {
    const at = chess.board.findIndex((p) => p?.type === 'k' && p.army === army);
    if (at >= 0) checked.add(at);
  }
  const selectableSet = new Set(selectable);
  const targetSet = new Set(targets);
  const selectedSet = new Set(selected);

  return (
    <div
      className="hexboard"
      role="grid"
      ref={boardRef}
      style={{ aspectRatio: `${layout.width} / ${layout.height}`, maxWidth: `min(100%, ${Math.round(layout.width * 1.1)}px)` }}
    >
      {layout.cells.map(({ sq, polygon }) => {
        const xs = polygon.map((p) => p[0]);
        const ys = polygon.map((p) => p[1]);
        const x0 = Math.min(...xs);
        const y0 = Math.min(...ys);
        const w = Math.max(...xs) - x0;
        const h = Math.max(...ys) - y0;
        const clip = polygon.map(([x, y]) => `${pct(((x - x0) / w) * 100)} ${pct(((y - y0) / h) * 100)}`).join(', ');
        const piece = chess.board[sq];
        const classes = [
          'sq',
          geo.isDark(sq) ? 'dark' : 'light',
          selectableSet.has(sq) ? 'selectable' : '',
          targetSet.has(sq) ? 'target' : '',
          selectedSet.has(sq) ? 'selected' : '',
          checked.has(sq) ? 'in-check' : '',
        ].join(' ');
        return (
          <button
            key={sq}
            type="button"
            className={classes}
            onClick={() => onSquare(sq)}
            data-testid={`sq-${sq}`}
            style={{
              left: pct((x0 / layout.width) * 100),
              top: pct((y0 / layout.height) * 100),
              width: pct((w / layout.width) * 100),
              height: pct((h / layout.height) * 100),
            }}
          >
            <span className="hex-face" style={{ clipPath: `polygon(${clip})` }} />
            {piece && (
              <PieceIcon
                army={piece.army}
                type={piece.type}
                pieceId={piece.id}
                className={`${shielded.has(piece.id) ? 'shielded' : ''} ${moved.has(piece.id) ? 'moved' : ''}`}
              />
            )}
            {piece && frozen.has(piece.id) && <span className="badge frozen" title="Frozen">{'❄'}</span>}
          </button>
        );
      })}
    </div>
  );
}
