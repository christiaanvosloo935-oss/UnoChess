# Three-Player Mode and Opening Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 3-player IsaChess (96-square hexagonal board, same cards, elimination by checkmate) beside the unchanged 2-player game, chosen from the opening page.

**Architecture:** The engine gets a `Geometry` (precomputed square tables: rays, jumps, pawn paths, castling, promotion) with two implementations, `classic` (8×8) and `three` (96 squares). Move generation, attack and check detection read only from the geometry. Game state and turn flow generalise from two players to N players, with `variant` stored in the state. Server rooms take 2 or 3 seats; the web app gets an opening page with two buttons and a `HexBoard`.

**Tech Stack:** TypeScript (npm workspaces: `engine`, `server`, `web`), Vitest, React + Vite, `ws`, Playwright for E2E. Run `npm install` once before anything else.

**Spec:** `docs/superpowers/specs/2026-10-15-three-player-design.md` (builds on `2026-10-13-isachess-online-design.md`).

## Global Constraints

- The 2-player game must behave exactly as today: `npm test` (all three packages) stays green after every task, including the engine perft tests (20/400/8902 from the start position).
- Armies: `'w' | 'r' | 'b'` (White, Red, Black), clockwise in that order. Classic uses only `w` and `b`.
- Square indices: classic `rank*8 + file` (unchanged). Three-player `section*32 + rank*8 + file`, where section 0/1/2 = `w`/`r`/`b`, file 0–7 = a–h, rank 0–3 = ranks 1–4 in that section's own frame.
- Engine stays pure: no I/O, no randomness except the seeded generator. `apply` never mutates its input.
- The server stays the authority; clients never see another player's hand or the draw-pile order.
- Hand size 7; the deck stays the 108-card deck; the draw rule is unchanged ("draw 1 at the end of the turn if the hand has fewer than 7 cards").
- Game ids stay 6 characters from `abcdefghjkmnpqrstuvwxyz23456789`; nicknames stay 1–20 characters.
- No attribution to any AI model in code, comments or docs; commit messages end with the trailer lines supplied by the session.
- Test commands: `npm test -w @isachess/engine`, `-w @isachess/server`, `-w @isachess/web` (server and web resolve the engine from `src`, no build needed). Type-check with `npx tsc --noEmit -p packages/<name>/tsconfig.json`.

## Geometry Decisions (the three-player board)

These pin down what the spec leaves to the implementer. Every one has a test in Task 2. Write the three-player tables in `geometry-three.ts` from these rules; the implementer may use any construction (e.g. a small "walker" that tracks position and heading and flips at seams) as long as the tests pass.

- **G1 Seams.** Orthogonally forward from `(s, f, rank 3)`: files 0–3 go to `(s+1 mod 3, 7−f, rank 3)`; files 4–7 go to `(s+2 mod 3, 7−f, rank 3)`. The reverse is the same adjacency. After crossing, "forward" means decreasing rank in the new section. So a file line is 8 squares: 4 in one section, 4 in the next.
- **G2 Ranks never wrap.** Rank neighbours are `(s, f±1, r)` inside the same section only.
- **G3 Rosette.** The six squares at the centre form a ring, in this order: `w.d4, w.e4, b.d4, b.e4, r.d4, r.e4` (index 0–5). Neighbours in the ring are orthogonal neighbours of each other (this follows from G1/G2).
- **G4 Diagonals.** A diagonal step from `(s,f,r)` by `(df, dr)`: ordinary squares inside a section move to `(f+df, r+dr)`. Stepping from rank 3 to "rank 4" crosses a seam: when `f` and `f+df` are in the same half (both ≤3 or both ≥4) the step lands on `(s', 7−(f+df), 3)` (s' by G1) and the ray continues there with `df` negated and `dr = −1`. Stepping from `(s,3,3)` by `(+1,+1)` or from `(s,4,3)` by `(−1,+1)` reaches the centre: it lands on the three rosette squares at ring offsets +2, +3, +4 from the starting square, and from each of those the ray continues outward along that square's own diagonal (from a `d4`: toward `c3`, `b2`, `a1` of its section; from an `e4`: toward `f3`, `g2`, `h1`). A ray that branches is stored as one ray per branch (shared prefix repeated). Rays end at board edges.
- **G5 Knights.** Eight moves: for each of the four orthogonal directions, walk two squares (crossing seams as in G1) and then one square to the left or right of the direction of travel.
- **G6 Kings.** Orthogonal neighbours plus the first square of each diagonal ray (so a rosette square has three centre-diagonal neighbours).
- **G7 Pawns.** Forward is increasing rank in the army's own section and decreasing rank in every other section. A push is the forward orthogonal neighbour (seam crossing allowed). A double step is only from rank 1 (index 1) of the pawn's own section to rank 3, both squares empty. Captures are the first square of the two forward diagonals (so a pawn on its own section's `d4`/`e4` toward the centre captures on all three centre-diagonal squares). A pawn promotes on rank 0 of any section other than its own army's.
- **G8 Castling, revive, start.** Castling is as classic inside the army's own section: king on file 4 rank 0, rooks on files 0 and 7, king ends on file 6 or 2. Revive squares are ranks 0–1 of the army's own section. Start position is the standard chess set-up on ranks 0–1 of each section (queen on file 3, king on file 4).
- **G9 Colours.** `isDark(sq) = (file + rank) % 2 === 0` in every section; this 2-colours the board so that orthogonal neighbours always differ (it holds across seams and around the rosette).
- **G10 Dead pieces.** An eliminated army's pieces stay on the board, never move, and still block and attack (spec §3 and §9).

## Review Focus

Likeliest ways a real game goes wrong that the spec only implies; each has a test in the named task.

1. Two players owing a skipped turn at the same time (A plays +2 on C, then B plays +2 on A before C's skip is used). Both skips must happen, once each. (Task 4)
2. Every remaining player stalemated at once with three still in. The game must end as a draw, not loop forever. (Task 5)
3. A player resigning out of turn, or while in the middle of a multi-move card on their own turn. The turn must pass cleanly and nobody is left "on move". (Task 5)
4. A fourth visitor to a full 3-player game, and a seated player refreshing in the lobby before the third player has joined. The fourth sees "full"; the refresher keeps their seat. (Task 6)
5. A pawn that crosses the seam and promotes on the far side, and a pawn on a rosette square capturing in all three centre directions. (Tasks 2 and 3)

---

### Task 1: Geometry abstraction for the 8×8 board (no behaviour change)

**Files:**
- Create: `packages/engine/src/geometry.ts`, `packages/engine/src/geometry-classic.ts`
- Modify: `packages/engine/src/types.ts`, `chess.ts`, `fen.ts`, `cards.ts`, `state.ts`, `index.ts`; `packages/engine/test/helpers.ts` and the test literals that build `captured`
- Test: `packages/engine/test/geometry-classic.test.ts`

**Interfaces:**
- Produces in `geometry.ts`:
  - `type Variant = 'classic' | 'three'`; `type Square = number` (already in types).
  - `interface CastleSide { kingTo: Square; rookFrom: Square; rookTo: Square; empty: Square[]; safe: Square[] }`
  - `interface Geometry { variant: Variant; armies: readonly Army[]; size: number; orthRays: Square[][][]; diagRays: Square[][][]; knightJumps: Square[][]; kingSteps: Square[][]; pawnPush(army: Army, sq: Square): Square | null; pawnDouble(army: Army, sq: Square): Square | null; pawnCaptures(army: Army, sq: Square): Square[]; pawnAttackersOf(army: Army, target: Square): Square[]; isPromotionSquare(army: Army, sq: Square): boolean; reviveSquares(army: Army): Square[]; startPieces(): { sq: Square; army: Army; type: PieceType }[]; castling(army: Army): { kingFrom: Square; k: CastleSide; q: CastleSide } | null; isDark(sq: Square): boolean }`
  - `geometryFor(variant: Variant): Geometry`; `enemiesOf(variant: Variant, army: Army): Army[]`.
- Changes in `types.ts`: `Army = 'w' | 'r' | 'b'`; `ChessState` gains `variant: Variant`; `Castling = Record<Army, { k: boolean; q: boolean }>`; `EnPassant` gains `victim: Square` (the square of the pawn that double-stepped); `GameState.captured: Record<Army, PieceType[]>`.
- `fromFen` returns `variant: 'classic'`, `castling.r = {k:false,q:false}`.

- [ ] **Step 1: Install and baseline.** Run `npm install`, then `npm test`. Expected: everything passes (this is the baseline to preserve).
- [ ] **Step 2: Write the failing test** `geometry-classic.test.ts` with these named tests: `has 64 squares and 16 start pieces per side` (`startPieces().length === 32`); `rook rays from a1`: `orthRays[0]` has two rays of lengths 7 (file) and 7 (rank); `knight on e4 has 8 jumps and on a1 has 2`; `pawn paths`: `pawnPush('w', e2)=e3`, `pawnDouble('w', e2)=e4`, `pawnDouble('w', e3)=null`, `pawnCaptures('b', e7)=[d6,f6]` (as a set), `pawnAttackersOf('w', e4)` = `{d3, f3}`; `promotion and revive`: `isPromotionSquare('w', a8)`, not `a7`; `reviveSquares('w')` = squares 0–15; `castling('w')`: `kingFrom=e1`, `k = {kingTo: g1, rookFrom: h1, rookTo: f1, empty:[f1,g1], safe:[f1,g1]}`, `q = {kingTo: c1, rookFrom: a1, rookTo: d1, empty:[b1,c1,d1], safe:[c1,d1]}`; `isDark(a1)` is true and `isDark(a2)` is false (matches the current `(file+rank)%2===0 ? 'dark'`).
- [ ] **Step 3: Run it** (`npm test -w @isachess/engine -- geometry-classic`). Expected: FAIL, module not found.
- [ ] **Step 4: Implement `geometry.ts` and `geometry-classic.ts`** per the interface above (tables built once at module load). `geometryFor('three')` may throw "not implemented" until Task 2.
- [ ] **Step 5: Rewire `chess.ts` onto the geometry.** `pseudoMoves`, `isSquareAttacked`, `isInCheck`, `revokeCastling`, `applyChessMove` must read only from `geometryFor(chess.variant)`: sliding moves walk `orthRays`/`diagRays` until blocked (a capture ends the ray), jumps use `knightJumps`/`kingSteps`, pawns use `pawnPush`/`pawnDouble`/`pawnCaptures`, promotion uses `isPromotionSquare`, castling uses `castling(army)`. `isSquareAttacked(chess, target, by)` keeps its signature; implement it by walking rays *from the target* (rays are symmetric), `pawnAttackersOf`, and the jump tables. `isInCheck(chess, army)` is true if the king is attacked by any army in `enemiesOf(chess.variant, army)`. `applyChessMove(chess, move, turn, nextMover?: Army)`: en passant records `{square, victim, capturer: nextMover ?? the other army, setOnTurn: turn}`; a capture by en passant removes the piece at `ep.victim` (carry the victim square on the `Move` as needed). `fen.ts` and `cards.ts` (`legalSwaps` promotion check and "gives check" check across all enemies, `legalRevives` squares) use the geometry; replace the `fromFen`/`toFen` literals only where types require.
- [ ] **Step 6: Fix types in tests/helpers.** Add `variant`-aware fields to `test/helpers.ts` (`captured: { w: [], r: [], b: [] }`) and add `r: []` to the `captured` literals in the engine and web tests (`grep -rn "captured: {" packages/*/test`). Run `npx tsc --noEmit -p packages/engine/tsconfig.json` and `-p packages/web/tsconfig.json`; expected: no errors.
- [ ] **Step 7: Run everything.** `npm test`. Expected: all green, perft unchanged (20/400/8902, 48/2039, 14/191/2812).
- [ ] **Step 8: Commit** `refactor(engine): move board geometry behind a Geometry interface`.

### Task 2: Three-player geometry tables

**Files:**
- Create: `packages/engine/src/geometry-three.ts`
- Modify: `geometry.ts` (register `'three'`), `index.ts`, `packages/engine/test/helpers.ts` (add `hsq(army: Army, name: string): Square`, e.g. `hsq('w','e2')` = `0*32 + 1*8 + 4`)
- Test: `packages/engine/test/geometry-three.test.ts`

**Interfaces:**
- Consumes: `Geometry`, `geometryFor` (Task 1).
- Produces: `geometryFor('three')` returning the 96-square `Geometry`; `hsq` test helper.

- [ ] **Step 1: Write the failing test** `geometry-three.test.ts` (all squares written with `hsq`, comparing as sets unless an order is stated):
  - `has 96 squares, 3 sections of 32, and 48 start pieces with each king on e1 of its section`.
  - `forward file rays cross the seam`: the ray from `w.a1` going up is `[w.a2, w.a3, w.a4, r.h4, r.h3, r.h2, r.h1]` (in order); from `w.f4` the forward ray is `[b.c4, b.c3, b.c2, b.c1]`.
  - `ranks do not wrap`: the rank rays from `w.a1` are exactly `[w.b1 … w.h1]` (no leftward ray, nothing leaves the section).
  - `rosette is a ring of six`: orthogonal neighbours of `w.d4` = `{w.c4, w.e4, w.d3, r.e4}`; of `w.e4` = `{w.d4, w.f4, w.e3, b.d4}`; of `b.e4` = `{b.d4, b.f4, b.e3, r.d4}`.
  - `diagonal crosses a seam`: the ray from `w.b3` toward the seam includes the prefix `[w.c4, r.e4, r.d3, r.c2, r.b1]` as one whole ray.
  - `diagonals branch three ways at the centre`: `diagRays[w.a1]` has exactly three rays, each starting `[w.b2, w.c3, w.d4]` and then continuing `[b.d4, b.c3, b.b2, b.a1]`, `[b.e4, b.f3, b.g2, b.h1]` and `[r.d4, r.c3, r.b2, r.a1]` respectively.
  - `knights`: `w.e2` = `{w.d4, w.f4, w.c3, w.g3, w.c1, w.g1}`; `w.c4` = `{r.e3, r.g3, r.h4, b.d4, w.a3, w.e3, w.b2, w.d2}`.
  - `kings`: `kingSteps[w.d4].length === 10`; `kingSteps[w.a1].length === 3`.
  - `symmetry`: for every square pair (a, b): b ∈ `kingSteps[a]` ⇔ a ∈ `kingSteps[b]`; same for `knightJumps`; b reachable along some `orthRays[a]` ⇔ a along some `orthRays[b]`; same for `diagRays`.
  - `pawns`: `pawnPush('w', w.c4)=r.f4`; `pawnPush('w', r.f4)=r.f3`; `pawnPush('r', w.c4)=w.c3`; `pawnDouble('w', w.c2)=w.c4`; `pawnDouble('w', w.c3)=null`; `pawnDouble('w', r.c2)=null`; `pawnCaptures('w', w.b2)={w.a3,w.c3}`; `pawnCaptures('w', w.d4)={r.f4, b.d4, b.e4, r.d4}`; for every army and square `pawnAttackersOf(army, t)` equals the squares s with t ∈ `pawnCaptures(army, s)`.
  - `promotion, revive, castling, colours`: `isPromotionSquare('w', r.a1)` and `('w', b.h1)` are true, `('w', w.a1)` false, `('r', r.a1)` false; `reviveSquares('w')` = ranks 1–2 of section w (16 squares); `castling('r').k = {kingTo: r.g1, rookFrom: r.h1, rookTo: r.f1, empty:[r.f1,r.g1], safe:[r.f1,r.g1]}`; for every orthogonal neighbour pair `isDark` differs.
- [ ] **Step 2: Run it.** Expected: FAIL ("not implemented").
- [ ] **Step 3: Implement `geometry-three.ts`** from G1–G10. Export a function building the tables once; keep all coordinate maths in this file. Register it in `geometryFor`.
- [ ] **Step 4: Run it.** `npm test -w @isachess/engine`. Expected: PASS, and the classic suites still green.
- [ ] **Step 5: Commit** `feat(engine): hexagonal three-player board geometry`.

### Task 3: Chess rules on the three-player board

**Files:**
- Modify: `chess.ts` (only if Task 1 left a classic-only assumption), `fen.ts` (add `startChess(variant: Variant): ChessState`), `test/helpers.ts` (add `hexChess(pieces: [Army, PieceType, string][]): ChessState` where the string is like `'w.e1'`)
- Test: `packages/engine/test/three-chess.test.ts`

**Interfaces:**
- Consumes: `geometryFor('three')`, `legalMoves(chess, army, ctx)`, `isInCheck`, `applyChessMove(chess, move, turn, nextMover)`.
- Produces: `startChess(variant)` giving the full starting `ChessState` (piece ids `${army}${type}${n}` as in `fromFen`, all castling rights true for the variant's armies).

- [ ] **Step 1: Write the failing test** `three-chess.test.ts` using `hexChess`:
  - `start position: each army has 20 legal moves`.
  - `a bishop on w.a1 with all squares free reaches b.a1, b.h1 and r.a1 through the centre` (three captures/targets after the shared prefix).
  - `check can come from either opponent, and from two at once`: white king on `w.e1`, red rook on `w.e4`-line and black rook giving check on rank 1 (`w.a1` side) → `isInCheck` true; every legal white move is a king move that leaves both lines.
  - `ladder mate across the section`: white king `w.a1`, red rooks on `w.h1` and `w.h2` → `isInCheck('w')` and `legalMoves(chess,'w')` is empty.
  - `stalemate pattern`: white king `w.a1` alone, red queen on `w.c2` and red king elsewhere → not in check, `legalMoves` empty.
  - `a pawn crossing the seam`: a white pawn on `w.c4` pushes to `r.f4`; a white pawn on `r.b2` pushes to `r.b1` and the move list for it has the four promotion choices.
  - `rosette pawn captures three ways`: white pawn on `w.d4`, enemy pieces on `b.d4`, `b.e4`, `r.d4` (kings elsewhere) → capture moves to all three.
  - `castling`: red king `r.e1`, rook `r.h1`, `f1`/`g1` empty and unattacked → a castle move to `r.g1`; revoked after the king moves.
  - `en passant only for the next mover`: white pawn double-steps `w.c2`→`w.c4` (call `applyChessMove(..., turn=1, nextMover='r')`); a red pawn on `w.d4` can capture onto `w.c3` removing the white pawn on `w.c4`; a black pawn placed to capture the same square cannot (capturer is `r`).
  - `dead pieces still block and attack`: a rook of an army with no mover in the test still gives check and blocks (the chess layer has no notion of "dead").
- [ ] **Step 2: Run it.** Expected: FAIL (`startChess` missing and any classic-only assumption exposed).
- [ ] **Step 3: Implement** `startChess` and fix whatever the tests expose in `chess.ts` (the tests must pass without special cases for the variant).
- [ ] **Step 4: Run** `npm test -w @isachess/engine`. Expected: PASS everywhere including perft.
- [ ] **Step 5: Commit** `feat(engine): chess rules on the three-player board`.

### Task 4: N-player game state, turn order and targeted cards

**Files:**
- Modify: `types.ts`, `state.ts`, `game.ts`, `cards.ts`, `index.ts`; callers of `createGame` in `packages/engine/test/game.test.ts`, `packages/server/test/ws.test.ts` (and `rooms.ts` later); `test/helpers.ts`
- Test: `packages/engine/test/three-game.test.ts`

**Interfaces:**
- Consumes: `startChess`, `armiesOf`, Task 1–3 chess layer.
- Produces:
  - `createGame(seed: number, players: PlayerId[], variant: Variant = 'classic'): GameState` (players listed clockwise; first moves first; deals 7 each).
  - `GameState` changes: `variant: Variant`; `players: PlayerId[]`; `seats: Partial<Record<Army, PlayerId>>`; `eliminated: PlayerId[]`; `effects.pendingSkips: PlayerId[]` (replaces `pendingSkip`).
  - `armyOf(state, player): Army`; `activePlayers(state): PlayerId[]` (clockwise, not eliminated); `opponentsOf(state, player): PlayerId[]` (active, excluding `player`); `nextPlayer(state, player): PlayerId` (next active clockwise after `player`).
  - `Action.playCard` gains `target?: PlayerId`. Cards 9, Reverse, +2, +4 require a `target` when `opponentsOf(...)` has more than one entry (error `Choose which opponent.`); with exactly one it is filled automatically; a target that is not an active opponent gives `You can't choose that player.`.
  - `helpers.ts`: `hexState(opts: { pieces: [Army, PieceType, string][]; hands?: Record<string, Card[]>; current?: string; captured?: Partial<Record<Army, PieceType[]>> }): GameState` with players `['A','B','C']` seated `w`,`r`,`b`.
  - `playCard` stores the turn's mover for en passant: pass `nextMover = armyOf(nextPlayer(...))` to `applyChessMove`.

- [ ] **Step 1: Write the failing test** `three-game.test.ts`:
  - `createGame for three: variant, players, seats {w:A, r:B, b:C}, 7 cards each, draw pile 87, 96-square board with 48 pieces, current A`.
  - `turn order is clockwise`: A plays a 0, then current is B, then C, then A.
  - `nextPlayer skips an eliminated player` (state with `eliminated: ['B']`: next after A is C).
  - `+2 needs a target with two opponents`: A plays +2 without a target → error `Choose which opponent.`; with `target: 'C'`: C's hand grows by 2, `pendingSkips` is `['C']`, after A's turn current is B, after B plays a 0 current is A (C skipped).
  - `two skips at once`: A plays +2 on C, B plays +2 on A → after B's turn current is B again (C and A both skipped, each once).
  - `Trade Hands swaps only with the target`; `Switch Sides swaps armies between the player and the target only` (third player's seat unchanged).
  - `a target who is eliminated or is yourself is refused`.
  - `two-player game is unchanged`: with exactly one opponent the target is filled in; the existing `game.test.ts` expectations still hold with the new `createGame` signature.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement** the type changes and helpers in `state.ts`; generalise `endCard` (next player via `nextPlayer`, shields still expire at `s.current`, skip loop over `pendingSkips`), `tradeEffect`, `reverseEffect`, `penaltyEffect` to the chosen target; update `createGame`. Update all `createGame` callers in tests.
- [ ] **Step 4: Run** `npm test -w @isachess/engine`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(engine): N-player turn order and targeted cards`.

### Task 5: Elimination, stalemate skip, resignation, winning

**Files:**
- Modify: `game.ts` (`judge`, `dispatch` resign), `cards.ts` (freeze targets), `types.ts` if the phase needs nothing new
- Test: `packages/engine/test/three-elimination.test.ts`

**Interfaces:**
- Consumes: Task 4 helpers.
- Produces: behaviour only. `Phase.over.reason` keeps `'checkmate' | 'stalemate' | 'resign'`; `GameState.eliminated` is maintained.

- [ ] **Step 1: Write the failing test** `three-elimination.test.ts` (positions from Task 3's ladder-mate and stalemate patterns; the third army keeps a king somewhere safe):
  - `a player who starts their turn checkmated is eliminated`: `eliminated` contains them, their hand is in `discardPile` and empty, their pieces are still on the board, play continues with the next active player, log says they were checkmated.
  - `the last remaining player wins`: when the second player is eliminated, `phase = { kind: 'over', winner: <last>, reason: 'checkmate' }`.
  - `stalemate with three in skips the turn`: no draw, no card, play moves on, `phase` stays `awaitingCard` for the next player.
  - `stalemate with two left is a draw`: `winner: null, reason: 'stalemate'`.
  - `every active player stalemated ends in a draw` (guard against looping).
  - `resign out of turn eliminates only that player` and play carries on; `resign while it is your turn mid-card` (phase `moving`) passes the turn to the next active player with `phase` reset to `awaitingCard`; `resign leaving one player` ends the game `reason: 'resign'`, winner the survivor. The classic resign test stays unchanged.
  - `eliminated players cannot act` (`apply` returns an error) except nothing else; `freeze targets exclude eliminated armies' pieces`; `an eliminated army's pieces still give check` to a live king.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement.** Turn start is a loop over `current`: apply shield expiry and skips (Task 4), then judge the mover: checkmated → eliminate (log, hand to discard, `eliminated`), end the game if one player is left, otherwise advance and judge again; stalemated with ≥3 active → log and advance; stalemated with 2 active → draw; if a whole cycle of active players has been skipped by stalemate → draw. `resign` is accepted from any active player at any time.
- [ ] **Step 4: Run** `npm test -w @isachess/engine`. Expected: PASS everywhere.
- [ ] **Step 5: Commit** `feat(engine): elimination, stalemate skip and resignation for three players`.

### Task 6: Views, legal options and protocol

**Files:**
- Modify: `view.ts`, `protocol.ts`; the engine and web tests that read `opponent`, `opponentHandCount`, `inCheck`, `room.opponentConnected`, `room.rematch`
- Test: `packages/engine/test/view.test.ts` (extend)

**Interfaces:**
- Produces:
  - `PlayerView`: `variant: Variant`; `opponents: { id: PlayerId; army: Army; handCount: number; eliminated: boolean }[]` (clockwise after the viewer; replaces `opponent` and `opponentHandCount`); `inCheck: Army[]` (every army currently in check; replaces `Army | null`); `options.targets: PlayerId[]` (active opponents a targeted card may pick; empty when it is not your turn).
  - `RoomInfo`: `{ names: Record<PlayerId,string>; connected: Record<PlayerId, boolean>; rematch: Record<PlayerId, boolean> }` (replaces `opponentConnected` and the `{you, opponent}` pair).
  - `ServerMessage` `lobby` gains `needed: number` (seats still empty); `ClientMessage` unchanged.

- [ ] **Step 1: Write the failing tests** in `view.test.ts`: `three-player view lists two opponents with hand counts and hides every other hand` (JSON of each player's view contains no card id from another hand and no draw-pile order); `inCheck lists every army in check`; `options.targets is the active opponents on your turn and empty otherwise`; the existing 2-player view test updated to `opponents[0].handCount`.
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement** the view and protocol changes; fix every reader (`tsc` on all three packages shows them).
- [ ] **Step 4: Run** `npm test -w @isachess/engine` and `npx tsc --noEmit -p packages/engine/tsconfig.json`. Expected: PASS, no type errors in the engine (server/web are fixed in the next tasks).
- [ ] **Step 5: Commit** `feat(engine): player view and protocol for N players`.

### Task 7: Server rooms, HTTP and WebSocket for 2 or 3 seats

**Files:**
- Modify: `packages/server/src/rooms.ts`, `http.ts`, `ws.ts`; `packages/server/test/rooms.test.ts`, `ws.test.ts`
- Test: both of the above

**Interfaces:**
- Consumes: `createGame(seed, players, variant)`, `RoomInfo`.
- Produces: `Rooms.create(nickname: string, variant: Variant = 'classic')`; `POST /api/games` body `{ nickname, variant? }` (`variant` must be `'classic'` or `'three'`, otherwise 400); a room's capacity is 2 or 3; `snapshot` returns `lobby` with `needed` until full, then `state` with the new `RoomInfo`; rematch needs every seated player's vote and seats rotate one place (the second player of the old order moves first).

- [ ] **Step 1: Write the failing tests.**
  - `rooms.test.ts`: `a three-player room stays in the lobby until the third seat is taken` (snapshots `lobby` with `needed` 2, then 1, then `state`); `a fourth visitor gets 'full'`; `a seated player re-joining with their token in the lobby keeps their seat`; `rematch needs all three votes and rotates seats` (`state.players` is the old order rotated by one); `the two-player tests are updated for connected/rematch maps and still pass`.
  - `ws.test.ts`: `three simulated clients play a few cards on the hex board` (create with variant three, all three join, first player plays a move card and a move; every client sees consistent `current`); `no client ever receives another client's hand ids or the draw pile`; `POST /api/games rejects an unknown variant with 400`.
- [ ] **Step 2: Run them.** `npm test -w @isachess/server`. Expected: FAIL.
- [ ] **Step 3: Implement** in `rooms.ts` (`Room.variant`, `capacity`, start the game when `seats.length === capacity`), `http.ts` (validate `variant`), `ws.ts` (no change beyond types unless the parser needs it).
- [ ] **Step 4: Run** `npm test -w @isachess/server` and `npx tsc --noEmit -p packages/server/tsconfig.json`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): rooms for two or three players`.

### Task 8: Opening page, lobby, and the game screen for three players

**Files:**
- Modify: `packages/web/src/api.ts`, `components/Home.tsx`, `App.tsx` (lobby text), `components/Game.tsx`, `GameOver.tsx`, `Pickers.tsx`, `PieceIcon.tsx`, `pieceNames.ts`, `interaction.ts`, `cardGuide.ts`, `styles.css`; create `components/ArmyName.ts` (`ARMY_NAME: Record<Army,string>` = White/Red/Black); create `public/pieces/rP.svg … rK.svg` (copy each `b?.svg` and change the black fill/stroke colours to a red such as `#c0392b`; do not touch the black set)
- Test: `packages/web/test/interaction.test.ts` (extend), `packages/web/test/cardGuide.test.ts` (extend)

**Interfaces:**
- Consumes: `PlayerView.opponents`, `options.targets`, `RoomInfo` maps.
- Produces:
  - `createGame(nickname: string, variant: Variant)` in `api.ts`.
  - Home page: two submit buttons, `data-testid="new-game"` ("2-player game", unchanged behaviour) and `data-testid="new-game-3"` ("3-player game"); both need a nickname.
  - `interaction.ts`: new role `'targeted'` for cards 9, Reverse, +2, +4; new `UiEvent` `{ type: 'chooseTarget'; playerId: PlayerId }`; with one entry in `options.targets` the card is sent at once (no `target`); with two the selection becomes `cardChosen` and `prompt` says `Choose which opponent`; `chooseTarget` sends `playCard` with `target`.
  - `Game.tsx`: opponents row (name, card back count, `Eliminated` or `disconnected` badge); status line and captured list cover every army in play; `TargetPicker` modal listing the active opponents; `GameOver` shows the winner by name and one Rematch button with who has voted.
  - The 3-player card guide notes that cards that name "your opponent" let you choose.

- [ ] **Step 1: Write the failing tests.** `interaction.test.ts`: `a targeted card with one opponent sends playCard without a target`; `with two opponents clicking the card selects it and the prompt asks which opponent`; `chooseTarget sends playCard with the target and returns to idle`; `chooseTarget for a player not in options.targets is ignored`. `cardGuide.test.ts`: the guide has a three-player note for the four targeted cards.
- [ ] **Step 2: Run them.** `npm test -w @isachess/web`. Expected: FAIL.
- [ ] **Step 3: Implement** the interaction changes first, then the components and styles; update `Game.tsx` to render `HexBoard` when `view.variant === 'three'` (stub until Task 9: render the existing `Board` for classic only). Lobby text: "Waiting for N more player(s)…" with the names that have joined.
- [ ] **Step 4: Run** `npm test -w @isachess/web` and `npx tsc --noEmit -p packages/web/tsconfig.json`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(web): opening page, lobby and game screen for three players`.

### Task 9: HexBoard

**Files:**
- Create: `packages/web/src/hexLayout.ts`, `packages/web/src/components/HexBoard.tsx`
- Modify: `components/Game.tsx` (use `HexBoard`), `styles.css`
- Test: `packages/web/test/hexLayout.test.ts`

**Interfaces:**
- Consumes: `geometryFor('three')` (for adjacency and `isDark`), the `Board` props (`view`, `selectable`, `targets`, `selected`, `onSquare`).
- Produces: `layoutHex(yourArmy: Army): { cells: { sq: Square; polygon: [number, number][]; cx: number; cy: number }[]; width: number; height: number }`. Layout rule: draw each section as two skewed 4×4 blocks (one per half-section) meeting at the centre, the six blocks arranged as a pinwheel with 60° between their edges at the centre, so the six rosette squares touch at the centre point; rotate so `yourArmy`'s back rank is at the bottom of the screen.

- [ ] **Step 1: Write the failing test** `hexLayout.test.ts`: `returns 96 cells with distinct centres`; `adjacent squares are drawn close`: for every orthogonal neighbour pair the distance between centres is less than 1.5 × the median cell width; `rosette squares all touch the centre`: each of the six rosette squares has a polygon vertex within 0.01 of one shared point; `the viewer's back rank is lowest on screen` for each of the three armies (mean `cy` of the army's rank-1 squares is the largest of all ranks of that army).
- [ ] **Step 2: Run it.** Expected: FAIL.
- [ ] **Step 3: Implement `layoutHex`** (pure function, no React) and `HexBoard`: a relatively positioned container; one `<button>` per cell absolutely positioned over the cell's bounding box with `clip-path: polygon(...)` in percent, `data-testid={`sq-${sq}`}`, the same classes as `Board` (`sq dark/light selectable target selected in-check`), the same piece, shield and frozen markers and the same `playTransition` call, king-in-check highlight for every army in `view.inCheck`. Reuse `PieceIcon`.
- [ ] **Step 4: Run** `npm test -w @isachess/web`; then `npm run build` and open the built app (`npm start`, create a 3-player game in three browser tabs) to look at the board once. Expected: tests PASS; the board shows 96 clickable squares with your army at the bottom.
- [ ] **Step 5: Commit** `feat(web): hexagonal board for three players`.

### Task 10: End-to-end test and docs

**Files:**
- Create: `e2e/three-player.spec.ts`
- Modify: `README.md`, `docs/superpowers/specs/2026-10-13-isachess-online-design.md` (one line pointing to the three-player spec), `packages/web/index.html` text if it says "two players"
- Test: `e2e/three-player.spec.ts` (and the existing `e2e/game.spec.ts` unchanged)

**Interfaces:**
- Consumes: `data-testid`s `new-game-3`, `copy-link`, `nickname`, `join-game`, `status`, `hand`, `done-moving`, `sq-<index>`, `result`.

- [ ] **Step 1: Write the test** `three-player.spec.ts`: three browser contexts; the first creates a 3-player game, the lobby shows "Waiting for 2 more players", the second and third join; the first player sees `Your turn: play a card` and the others see the first player's name; the first plays a move card and moves the pawn on `w.e2` to `w.e4` (`sq-12`→`sq-28`) then Done moving; the second player (Red) sees the pawn on `sq-28`, plays a move card and moves their `r.e2` (`sq-44`) to `sq-60`; a fourth page opening the link sees "This game is full."
- [ ] **Step 2: Run** `npm run e2e`. Expected: new test FAIL until the seeded cards give a move card to each player; if the seed's hands do not, set the room's seed in the test by creating the game via the existing `ISACHESS_SEED` and choose a move card by label as the 2-player test does.
- [ ] **Step 3: Fix and re-run** `npm run e2e`. Expected: both specs PASS.
- [ ] **Step 4: Docs.** README: mention the two modes, how three-player works in four lines (board, elimination, last king wins, choosing an opponent for targeted cards) and link the spec. Add a line in the 2-player spec's status that the three-player spec extends it.
- [ ] **Step 5: Final check.** `npm test && npm run build && npm run e2e`. Expected: everything passes.
- [ ] **Step 6: Commit** `docs: three-player mode and end-to-end test`.
