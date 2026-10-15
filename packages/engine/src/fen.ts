import type { Army, ChessState, Piece, PieceType } from './types.js';

export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export function fromFen(fen: string): { chess: ChessState; toMove: Army } {
  const [placement, side, castle, ep] = fen.split(' ');
  const board: (Piece | null)[] = new Array(64).fill(null);
  const counters: Record<string, number> = {};
  const ranks = placement.split('/');
  ranks.forEach((row, i) => {
    const rank = 7 - i;
    let file = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) {
        file += Number(ch);
        continue;
      }
      const army: Army = ch === ch.toUpperCase() ? 'w' : 'b';
      const type = ch.toLowerCase() as PieceType;
      const key = army + type;
      const n = counters[key] ?? 0;
      counters[key] = n + 1;
      board[rank * 8 + file] = { id: `${key}${n}`, type, army };
      file++;
    }
  });
  const castling = {
    w: { k: castle.includes('K'), q: castle.includes('Q') },
    r: { k: false, q: false },
    b: { k: castle.includes('k'), q: castle.includes('q') },
  };
  const toMove: Army = side === 'b' ? 'b' : 'w';
  let enPassant: ChessState['ep'] = null;
  if (ep && ep !== '-') {
    const square = (Number(ep[1]) - 1) * 8 + (ep.charCodeAt(0) - 97);
    enPassant = {
      square,
      victim: toMove === 'b' ? square + 8 : square - 8,
      capturer: toMove,
      setOnTurn: 0,
    };
  }
  return { chess: { variant: 'classic', board, castling, ep: enPassant }, toMove };
}

export function toFen(chess: ChessState, toMove: Army): string {
  const rows: string[] = [];
  for (let rank = 7; rank >= 0; rank--) {
    let row = '';
    let empty = 0;
    for (let file = 0; file < 8; file++) {
      const p = chess.board[rank * 8 + file];
      if (!p) {
        empty++;
        continue;
      }
      if (empty) row += empty;
      empty = 0;
      row += p.army === 'w' ? p.type.toUpperCase() : p.type;
    }
    if (empty) row += empty;
    rows.push(row);
  }
  const c = chess.castling;
  const castle =
    (c.w.k ? 'K' : '') + (c.w.q ? 'Q' : '') + (c.b.k ? 'k' : '') + (c.b.q ? 'q' : '') || '-';
  const ep = chess.ep
    ? String.fromCharCode(97 + (chess.ep.square % 8)) + (Math.floor(chess.ep.square / 8) + 1)
    : '-';
  return `${rows.join('/')} ${toMove} ${castle} ${ep} 0 1`;
}
