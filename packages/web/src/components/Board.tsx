import { useLayoutEffect, useRef } from 'react';
import { exhaustedPieces, type Army, type Effects, type PlayerView, type Square } from '@isachess/engine';
import { diffBoards, newEffects, shouldAnimate, type BoardMeta } from '../animation';
import { playTransition, prefersReducedMotion } from '../animatePieces';
import { PieceIcon } from './PieceIcon';

interface Props {
  view: PlayerView;
  selectable: Square[];
  targets: Square[];
  selected: Square[];
  onSquare: (sq: Square) => void;
}

export function Board({ view, selectable, targets, selected, onSquare }: Props) {
  const { chess, yourArmy, effects, phase } = view;
  const boardRef = useRef<HTMLDivElement>(null);
  const previous = useRef<{ board: PlayerView['chess']['board']; effects: Effects; meta: BoardMeta } | null>(null);

  // After the DOM shows the new position, slide/fade the pieces that changed so the old position is never painted.
  useLayoutEffect(() => {
    const meta: BoardMeta = { army: view.yourArmy, turn: view.turn };
    const before = previous.current;
    previous.current = { board: view.chess.board, effects: view.effects, meta };
    if (!before || !boardRef.current || !shouldAnimate(before.meta, meta) || prefersReducedMotion()) return;
    playTransition(boardRef.current, diffBoards(before.board, view.chess.board), newEffects(before.effects, view.effects));
  }, [view.chess.board, view.effects, view.yourArmy, view.turn]);

  const ranks = yourArmy === 'w' ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
  const files = yourArmy === 'w' ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
  const frozen = new Set(effects.frozen.map((f) => f.pieceId));
  const shielded = new Set(effects.shields.map((s) => s.pieceId));
  const moved = exhaustedPieces(phase.kind === 'moving' ? phase.moved : []); // greyed out once a piece used its two moves
  const kingInCheck: Square = view.inCheck.length > 0 ? chess.board.findIndex((p) => p?.type === 'k' && p.army === view.inCheck[0]) : -1;
  const selectableSet = new Set(selectable);
  const targetSet = new Set(targets);
  const selectedSet = new Set(selected);

  return (
    <div className="board" role="grid" ref={boardRef}>
      {ranks.flatMap((rank) =>
        files.map((file) => {
          const sq = rank * 8 + file;
          const piece = chess.board[sq];
          const classes = [
            'sq',
            (file + rank) % 2 === 0 ? 'dark' : 'light',
            selectableSet.has(sq) ? 'selectable' : '',
            targetSet.has(sq) ? 'target' : '',
            selectedSet.has(sq) ? 'selected' : '',
            sq === kingInCheck ? 'in-check' : '',
          ].join(' ');
          return (
            <button key={sq} type="button" className={classes} onClick={() => onSquare(sq)} data-testid={`sq-${sq}`}>
              {piece && (
                <PieceIcon
                  army={piece.army}
                  type={piece.type}
                  pieceId={piece.id}
                  className={`${shielded.has(piece.id) ? 'shielded' : ''} ${moved.has(piece.id) ? 'moved' : ''}`}
                />
              )}
              {piece && frozen.has(piece.id) && <span className="badge frozen" title="Frozen">{'❄'}</span>}
              {rank === (yourArmy === 'w' ? 0 : 7) && <span className="coord file">{String.fromCharCode(97 + file)}</span>}
              {file === (yourArmy === 'w' ? 0 : 7) && <span className="coord rank">{rank + 1}</span>}
            </button>
          );
        }),
      )}
    </div>
  );
}
