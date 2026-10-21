import { enemiesOf, geometryFor, type Variant } from './geometry.js';
import type { Army, Castling, ChessState, Move, Piece, PieceType, Square } from './types.js';

export interface MoveContext {
  frozen?: ReadonlySet<string>; // piece ids that may not move
  shielded?: ReadonlySet<string>; // piece ids that may not be captured
  moved?: ReadonlySet<string>; // piece ids that used up their moves this card (rule B: two moves each)
  turn?: number; // en passant needs ep.setOnTurn === turn - 1; omitted: ep usable
}


export function findKing(chess: ChessState, army: Army): Square {
  return chess.board.findIndex((p) => p?.type === 'k' && p.army === army);
}

export function isSquareAttacked(chess: ChessState, target: Square, by: Army): boolean {
  const { board } = chess;
  const geo = geometryFor(chess.variant);
  for (const from of geo.pawnAttackersOf(by, target)) {
    const p = board[from];
    if (p && p.army === by && p.type === 'p') return true;
  }
  for (const from of geo.knightJumps[target]) {
    const p = board[from];
    if (p && p.army === by && p.type === 'n') return true;
  }
  for (const from of geo.kingSteps[target]) {
    const p = board[from];
    if (p && p.army === by && p.type === 'k') return true;
  }
  const ray = (rays: Square[][], types: PieceType[]) => {
    for (const r of rays) {
      for (const sq of r) {
        const p = board[sq];
        if (p) {
          if (p.army === by && types.includes(p.type)) return true;
          break;
        }
      }
    }
    return false;
  };
  return ray(geo.orthRays[target], ['r', 'q']) || ray(geo.diagRays[target], ['b', 'q']);
}

function attackedByAny(chess: ChessState, target: Square, by: readonly Army[]): boolean {
  return by.some((a) => isSquareAttacked(chess, target, a));
}

export function isInCheck(chess: ChessState, army: Army): boolean {
  const k = findKing(chess, army);
  return k >= 0 && attackedByAny(chess, k, enemiesOf(chess.variant, army));
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
  const geo = geometryFor(chess.variant);
  const out: Move[] = [];
  const tag = asType !== piece.type ? { as: asType } : {};

  const canLand = (t: Piece | null) =>
    !t || (t.army !== army && t.type !== 'k' && !ctx.shielded?.has(t.id));
  const add = (to: Square, extra: Partial<Move> = {}) => {
    if (piece.type === 'p' && geo.isPromotionSquare(army, to)) {
      for (const promotion of ['q', 'r', 'b', 'n'] as const) {
        out.push({ from, to, promotion, ...tag, ...extra });
      }
    } else {
      out.push({ from, to, ...tag, ...extra });
    }
  };

  if (asType === 'n' || asType === 'k') {
    for (const to of asType === 'n' ? geo.knightJumps[from] : geo.kingSteps[from]) {
      if (canLand(board[to])) add(to);
    }
  } else if (asType === 'b' || asType === 'r' || asType === 'q') {
    const rays =
      asType === 'b' ? geo.diagRays[from] : asType === 'r' ? geo.orthRays[from] : [...geo.orthRays[from], ...geo.diagRays[from]];
    for (const ray of rays) {
      for (const to of ray) {
        const t = board[to];
        if (!t) add(to);
        else {
          if (canLand(t)) add(to);
          break;
        }
      }
    }
  } else {
    const push = geo.pawnPush(army, from);
    if (push !== null && !board[push]) {
      add(push);
      const dbl = geo.pawnDouble(army, from);
      if (dbl !== null && !board[dbl]) add(dbl);
    }
    for (const to of geo.pawnCaptures(army, from)) {
      const t = board[to];
      if (t && canLand(t)) add(to);
      else if (
        !t && opts.allowEp && chess.ep && chess.ep.square === to && chess.ep.capturer === army &&
        (ctx.turn === undefined || chess.ep.setOnTurn === ctx.turn - 1)
      ) {
        const victim = board[chess.ep.victim];
        if (victim && victim.type === 'p' && !ctx.shielded?.has(victim.id)) add(to, { enPassant: true });
      }
    }
  }

  const castle = geo.castling(army);
  if (opts.allowCastle && asType === 'k' && piece.type === 'k' && castle && from === castle.kingFrom) {
    const enemies = enemiesOf(chess.variant, army);
    if (!attackedByAny(chess, from, enemies)) {
      const rights = chess.castling[army];
      for (const side of ['k', 'q'] as const) {
        const c = castle[side];
        const rook = board[c.rookFrom];
        const rookOk = !!rook && rook.type === 'r' && rook.army === army && !ctx.frozen?.has(rook.id) && !ctx.moved?.has(rook.id);
        if (
          rights[side] && rookOk && c.empty.every((s) => !board[s]) &&
          c.safe.every((s) => !attackedByAny(chess, s, enemies))
        ) {
          out.push({ from, to: c.kingTo, castle: side });
        }
      }
    }
  }
  return out;
}

/** Castling rights lost because a piece left or landed on any of these squares. */
export function revokeCastling(variant: Variant, rights: Castling, ...squares: Square[]): Castling {
  const geo = geometryFor(variant);
  const out = { w: { ...rights.w }, r: { ...rights.r }, b: { ...rights.b } };
  for (const sq of squares) {
    for (const army of geo.armies) {
      const c = geo.castling(army);
      if (!c) continue;
      if (sq === c.kingFrom) out[army] = { k: false, q: false };
      else if (sq === c.k.rookFrom) out[army].k = false;
      else if (sq === c.q.rookFrom) out[army].q = false;
    }
  }
  return out;
}

export function applyChessMove(
  chess: ChessState,
  move: Move,
  turn: number,
  nextMover?: Army,
): { chess: ChessState; captured: Piece | null } {
  const geo = geometryFor(chess.variant);
  const board = chess.board.slice();
  const piece = board[move.from]!;
  const army = piece.army;
  let captured: Piece | null = board[move.to];
  board[move.from] = null;
  if (move.enPassant && chess.ep) {
    captured = board[chess.ep.victim];
    board[chess.ep.victim] = null;
  }
  board[move.to] = move.promotion ? { ...piece, type: move.promotion } : piece;
  if (move.castle) {
    const side = geo.castling(army)![move.castle];
    board[side.rookTo] = board[side.rookFrom];
    board[side.rookFrom] = null;
  }

  const castling = revokeCastling(chess.variant, chess.castling, move.from, move.to);

  let ep: ChessState['ep'] = null;
  if (piece.type === 'p' && move.as === undefined && geo.pawnDouble(army, move.from) === move.to) {
    ep = {
      square: geo.pawnPush(army, move.from)!,
      victim: move.to,
      capturer: nextMover ?? geo.armies[(geo.armies.indexOf(army) + 1) % geo.armies.length],
      setOnTurn: turn,
    };
  }
  return { chess: { variant: chess.variant, board, castling, ep }, captured };
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
