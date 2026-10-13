import type { Army, ChessState, Move, Piece, PieceType, Square } from './types.js';

export interface MoveContext {
  frozen?: ReadonlySet<string>; // piece ids that may not move
  shielded?: ReadonlySet<string>; // piece ids that may not be captured
  moved?: ReadonlySet<string>; // piece ids already moved this card (rule B)
  turn?: number; // en passant needs ep.setOnTurn === turn - 1; omitted: ep usable
}

const KNIGHT = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
const KING = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ORTH = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const fileOf = (sq: Square) => sq & 7;
const rankOf = (sq: Square) => sq >> 3;
const inBoard = (f: number, r: number) => f >= 0 && f < 8 && r >= 0 && r < 8;
const other = (a: Army): Army => (a === 'w' ? 'b' : 'w');

export function findKing(chess: ChessState, army: Army): Square {
  return chess.board.findIndex((p) => p?.type === 'k' && p.army === army);
}

export function isSquareAttacked(chess: ChessState, target: Square, by: Army): boolean {
  const { board } = chess;
  const tf = fileOf(target);
  const tr = rankOf(target);
  const at = (f: number, r: number): Piece | null => (inBoard(f, r) ? board[r * 8 + f] : null);
  const dir = by === 'w' ? 1 : -1;
  for (const df of [-1, 1]) {
    const p = at(tf + df, tr - dir);
    if (p && p.army === by && p.type === 'p') return true;
  }
  for (const [df, dr] of KNIGHT) {
    const p = at(tf + df, tr + dr);
    if (p && p.army === by && p.type === 'n') return true;
  }
  for (const [df, dr] of KING) {
    const p = at(tf + df, tr + dr);
    if (p && p.army === by && p.type === 'k') return true;
  }
  const ray = (dirs: number[][], types: PieceType[]) => {
    for (const [df, dr] of dirs) {
      let f = tf + df;
      let r = tr + dr;
      while (inBoard(f, r)) {
        const p = board[r * 8 + f];
        if (p) {
          if (p.army === by && types.includes(p.type)) return true;
          break;
        }
        f += df;
        r += dr;
      }
    }
    return false;
  };
  return ray(ORTH, ['r', 'q']) || ray(DIAG, ['b', 'q']);
}

export function isInCheck(chess: ChessState, army: Army): boolean {
  const k = findKing(chess, army);
  return k >= 0 && isSquareAttacked(chess, k, other(army));
}

interface GenOpts {
  allowCastle: boolean;
  allowEp: boolean;
}

function pseudoMoves(
  chess: ChessState,
  from: Square,
  asType: PieceType,
  ctx: MoveContext,
  opts: GenOpts,
): Move[] {
  const { board } = chess;
  const piece = board[from];
  if (!piece) return [];
  if (ctx.frozen?.has(piece.id) || ctx.moved?.has(piece.id)) return [];
  const army = piece.army;
  const ff = fileOf(from);
  const fr = rankOf(from);
  const lastRank = army === 'w' ? 7 : 0;
  const out: Move[] = [];
  const tag = asType !== piece.type ? { as: asType } : {};

  const canLand = (t: Piece | null) =>
    !t || (t.army !== army && t.type !== 'k' && !ctx.shielded?.has(t.id));
  const add = (to: Square, extra: Partial<Move> = {}) => {
    if (piece.type === 'p' && rankOf(to) === lastRank) {
      for (const promotion of ['q', 'r', 'b', 'n'] as const) {
        out.push({ from, to, promotion, ...tag, ...extra });
      }
    } else {
      out.push({ from, to, ...tag, ...extra });
    }
  };

  if (asType === 'n' || asType === 'k') {
    for (const [df, dr] of asType === 'n' ? KNIGHT : KING) {
      const f = ff + df;
      const r = fr + dr;
      if (inBoard(f, r) && canLand(board[r * 8 + f])) add(r * 8 + f);
    }
  } else if (asType === 'b' || asType === 'r' || asType === 'q') {
    const dirs = asType === 'b' ? DIAG : asType === 'r' ? ORTH : [...ORTH, ...DIAG];
    for (const [df, dr] of dirs) {
      let f = ff + df;
      let r = fr + dr;
      while (inBoard(f, r)) {
        const t = board[r * 8 + f];
        if (!t) add(r * 8 + f);
        else {
          if (canLand(t)) add(r * 8 + f);
          break;
        }
        f += df;
        r += dr;
      }
    }
  } else {
    const dir = army === 'w' ? 1 : -1;
    const startRank = army === 'w' ? 1 : 6;
    if (inBoard(ff, fr + dir) && !board[(fr + dir) * 8 + ff]) {
      add((fr + dir) * 8 + ff);
      if (fr === startRank && !board[(fr + 2 * dir) * 8 + ff]) add((fr + 2 * dir) * 8 + ff);
    }
    for (const df of [-1, 1]) {
      const f = ff + df;
      const r = fr + dir;
      if (!inBoard(f, r)) continue;
      const to = r * 8 + f;
      const t = board[to];
      if (t && canLand(t)) add(to);
      else if (
        !t && opts.allowEp && chess.ep && chess.ep.square === to && chess.ep.capturer === army &&
        (ctx.turn === undefined || chess.ep.setOnTurn === ctx.turn - 1)
      ) {
        const victim = board[fr * 8 + f];
        if (victim && victim.type === 'p' && !ctx.shielded?.has(victim.id)) add(to, { enPassant: true });
      }
    }
  }

  if (opts.allowCastle && asType === 'k' && piece.type === 'k') {
    const homeRank = army === 'w' ? 0 : 7;
    const enemy = other(army);
    if (from === homeRank * 8 + 4 && !isSquareAttacked(chess, from, enemy)) {
      const rights = chess.castling[army];
      const rookOk = (sq: Square) => {
        const r = board[sq];
        return !!r && r.type === 'r' && r.army === army && !ctx.frozen?.has(r.id) && !ctx.moved?.has(r.id);
      };
      const free = (...files: number[]) => files.every((f) => !board[homeRank * 8 + f]);
      const safe = (...files: number[]) => files.every((f) => !isSquareAttacked(chess, homeRank * 8 + f, enemy));
      if (rights.k && rookOk(homeRank * 8 + 7) && free(5, 6) && safe(5, 6)) {
        out.push({ from, to: homeRank * 8 + 6, castle: 'k' });
      }
      if (rights.q && rookOk(homeRank * 8) && free(1, 2, 3) && safe(2, 3)) {
        out.push({ from, to: homeRank * 8 + 2, castle: 'q' });
      }
    }
  }
  return out;
}

export function applyChessMove(
  chess: ChessState,
  move: Move,
  turn: number,
): { chess: ChessState; captured: Piece | null } {
  const board = chess.board.slice();
  const piece = board[move.from]!;
  const army = piece.army;
  let captured: Piece | null = board[move.to];
  board[move.from] = null;
  if (move.enPassant) {
    const victimSq = rankOf(move.from) * 8 + fileOf(move.to);
    captured = board[victimSq];
    board[victimSq] = null;
  }
  board[move.to] = move.promotion ? { ...piece, type: move.promotion } : piece;
  if (move.castle) {
    const rank = rankOf(move.from);
    const [rookFrom, rookTo] = move.castle === 'k' ? [rank * 8 + 7, rank * 8 + 5] : [rank * 8, rank * 8 + 3];
    board[rookTo] = board[rookFrom];
    board[rookFrom] = null;
  }

  const castling = { w: { ...chess.castling.w }, b: { ...chess.castling.b } };
  for (const sq of [move.from, move.to]) {
    if (sq === 4) castling.w = { k: false, q: false };
    else if (sq === 60) castling.b = { k: false, q: false };
    else if (sq === 0) castling.w.q = false;
    else if (sq === 7) castling.w.k = false;
    else if (sq === 56) castling.b.q = false;
    else if (sq === 63) castling.b.k = false;
  }

  let ep: ChessState['ep'] = null;
  if (piece.type === 'p' && move.as === undefined && Math.abs(rankOf(move.to) - rankOf(move.from)) === 2) {
    ep = {
      square: ((rankOf(move.from) + rankOf(move.to)) / 2) * 8 + fileOf(move.from),
      capturer: other(army),
      setOnTurn: turn,
    };
  }
  return { chess: { board, castling, ep }, captured };
}

function leavesKingSafe(chess: ChessState, move: Move, army: Army, turn: number): boolean {
  return !isInCheck(applyChessMove(chess, move, turn).chess, army);
}

export function legalMoves(chess: ChessState, army: Army, ctx: MoveContext = {}): Move[] {
  const out: Move[] = [];
  chess.board.forEach((p, from) => {
    if (!p || p.army !== army) return;
    for (const m of pseudoMoves(chess, from, p.type, ctx, { allowCastle: true, allowEp: true })) {
      if (leavesKingSafe(chess, m, army, ctx.turn ?? 0)) out.push(m);
    }
  });
  return out;
}

export function movesAs(chess: ChessState, from: Square, as: PieceType, ctx: MoveContext = {}): Move[] {
  const piece = chess.board[from];
  if (!piece) return [];
  return pseudoMoves(chess, from, as, ctx, { allowCastle: false, allowEp: false }).filter((m) =>
    leavesKingSafe(chess, m, piece.army, ctx.turn ?? 0),
  );
}
