import type { Army, PlayerView, Square } from '@unochess/engine';
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
  const ranks = yourArmy === 'w' ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
  const files = yourArmy === 'w' ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
  const frozen = new Set(effects.frozen.map((f) => f.pieceId));
  const shielded = new Set(effects.shields.map((s) => s.pieceId));
  const moved = new Set(phase.kind === 'moving' ? phase.moved : []);
  const kingInCheck: Square = view.inCheck ? chess.board.findIndex((p) => p?.type === 'k' && p.army === (view.inCheck as Army)) : -1;
  const selectableSet = new Set(selectable);
  const targetSet = new Set(targets);
  const selectedSet = new Set(selected);

  return (
    <div className="board" role="grid">
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
