# IsaChess Online Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A browser game where two friends play IsaChess against each other by sharing a link. A Node server enforces every house rule and keeps both hands secret.

**Architecture:** An npm-workspaces TypeScript monorepo with three packages:
- `engine`: pure rules logic plus the shared protocol types.
- `server`: Node `http` + `ws`, with authoritative in-memory games.
- `web`: React + Vite.

The server validates every action with `engine.apply` and sends each player only `engine.viewFor(state, player)`.

**Tech Stack:** Node 22, TypeScript (strict, ESM), Vitest, `ws`, React 19, Vite, Playwright (e2e).

**Spec:** `docs/superpowers/specs/2026-10-13-isachess-online-design.md`. Read §5 before any engine task. Every numbered clarification there is binding.

## Global Constraints

- Node 22, npm workspaces, `"type": "module"` everywhere, TypeScript `strict: true`.
- Package names: `@isachess/engine`, `@isachess/server`, `@isachess/web`.
- The engine has no runtime dependencies and does no I/O. All randomness comes from a seeded RNG stored in state, so a state is plain JSON and serialisable.
- `apply` never mutates its input state.
- Deck: 108 cards. That is one 0 per colour, two each of 1–9 per colour, two Skip, two Reverse and two Draw Two per colour, four Wild and four Wild Draw Four. Each player is dealt 7.
- The draw step: after a card resolves, draw 1 only if the hand has fewer than 7 cards (spec §5.9).
- Squares are integers 0–63 with `a1 = 0`, `h1 = 7`, `a8 = 56`. Index = `rank * 8 + file`.
- Playwright uses the pre-installed Chromium: `executablePath: '/opt/pw-browsers/chromium'`. Never run `playwright install`.
- No accounts, persistence, chat, clocks, AI, spectators, 50-move rule or threefold repetition (spec §1).

## Decisions this plan adds to the spec

The spec leaves these open, so the plan fixes them:

1. **Card effects with targets are a single action.** `playCard` carries the effect's arguments (`args`) for Swap, Freeze, Shield, Shapeshift and Revive. The UI collects the targets before it sends anything. This avoids a half-played card with no way to cancel. Only move cards (1–5, or any card played "as a 1") enter a multi-step `moving` phase.
2. **A card whose effect has no legal target may still be played, with no effect.** For example, a Shield when only the king is left, or a Revive with nothing captured. This applies only when not in check. In check, §5.3 applies.
3. **Stalemate ignores freezes. Checkmate counts them** (§5.2). A freeze is temporary and the player can always play a 0.
4. **Swap restrictions.** A Swap may not put a pawn on its own last rank. A Swap involving a king or rook removes the matching castling rights.
5. **En passant.** The en passant square is available only to the opponent's first move of the very next turn. Any move clears it, unless that move creates a new one. It is also cleared at the end of every turn after the one that created it.
6. **Freezing a king is allowed.** The rulebook says "one enemy piece."
7. **Shapeshift's borrowed type must differ from the piece's own type.**
8. **Rematch** starts when both players have clicked Rematch. The player who started the previous game as White starts the new one as Black.
9. **A player may open several tabs.** Every socket attached to a seat receives updates, and actions are accepted from any of them.
10. **An exhausted deck draws what it can.** If both the draw pile and the reshuffled discard pile run out, the player draws as many cards as exist and the game continues.

## Review Focus

These are the most likely real-world failures that the spec doesn't spell out. Each has a pinning test in the task named.

1. **Double-clicks and stale actions** (the same move sent twice, an action when it isn't your turn) are rejected with an error, and the state is unchanged. *Task 4, Task 8.*
2. **Malformed socket messages** (non-JSON, an unknown `type`, missing fields) get an `error` reply. The socket stays open and the server doesn't crash. *Task 8.*
3. **A pawn move to the last rank without a promotion piece** is rejected with `"Choose a promotion piece"`, not auto-queened or crashed. *Task 4.*
4. **Both piles exhausted** after many Draw Fours: drawing returns fewer cards and the game continues. *Task 3.*
5. **Refreshing mid-turn** (halfway through a 4-card) restores the same `moving` phase and moves-left count. *Task 8* (server reconnect test) and *Task 10* (UI rebuilds solely from `view`).

---

## File Structure

```
package.json                  workspaces, root scripts (build, test, start, e2e)
tsconfig.base.json            shared strict compiler options
render.yaml                   Render web service
README.md                     run locally + deploy to Render
packages/engine/
  package.json, tsconfig.json, vitest.config.ts
  src/index.ts                public exports
  src/types.ts                Army, PieceType, Square, Piece, ChessState, Move, Card, GameState, Phase, Action, PlayerView, events
  src/rng.ts                  seeded RNG (mulberry32), shuffle
  src/fen.ts                  fromFen / toFen (tests + debugging)
  src/chess.ts                move generation, attacks, check, applyChessMove — pure chess with effect context
  src/deck.ts                 buildDeck, drawCards (with reshuffle)
  src/game.ts                 createGame, apply, turn flow
  src/cards.ts                per-card legality: legalSwaps, legalFreezeTargets, legalShieldTargets, legalShapeshifts, legalRevives, playableCards
  src/view.ts                 viewFor, legalOptions
  src/protocol.ts             ClientMessage / ServerMessage types
  test/*.test.ts
packages/server/
  package.json, tsconfig.json, vitest.config.ts
  src/index.ts                start(): http + ws on PORT
  src/rooms.ts                Room store: create, join, reconnect, act, rematch, cleanup
  src/http.ts                 POST /api/games, static file serving for web/dist with SPA fallback
  src/ws.ts                   socket message handling
  test/*.test.ts
packages/web/
  package.json, tsconfig.json, vite.config.ts, index.html
  src/main.tsx, src/App.tsx   path routing: "/" → Home, "/g/:id" → Game
  src/api.ts                  createGame(nickname)
  src/seat.ts                 seat-token cookie get/set
  src/useGame.ts              WebSocket hook with reconnect
  src/interaction.ts          pure selection state machine → Action (unit tested)
  src/components/…            Board, Hand, CardView, StatusBar, Log, Pickers, GameOver, Toast
  src/styles.css
  test/interaction.test.ts
e2e/
  playwright.config.ts, game.spec.ts
```

**Engine resolution:** `@isachess/engine`'s `package.json` exports `./dist/index.js` (built with `tsc`). The Vitest configs for server and web, and `vite.config.ts`, alias `@isachess/engine` to `../engine/src/index.ts`, so development and tests don't need an engine build.

---

### Task 1: Monorepo scaffold, engine types, RNG, FEN

**Files:**
- Create: root `package.json`, `tsconfig.base.json`, `.gitignore` (`node_modules`, `dist`, `test-results`, `playwright-report`)
- Create: `packages/engine/{package.json,tsconfig.json,vitest.config.ts}`, `src/{index,types,rng,fen}.ts`
- Test: `packages/engine/test/fen.test.ts`, `packages/engine/test/rng.test.ts`

**Interfaces (Produces), in `src/types.ts`:**
```ts
export type Army = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type PromotionType = 'q' | 'r' | 'b' | 'n';
export type Square = number;
export type PlayerId = string;
export interface Piece { id: string; type: PieceType; army: Army }
export interface Castling { w: { k: boolean; q: boolean }; b: { k: boolean; q: boolean } }
export interface EnPassant { square: Square; capturer: Army; setOnTurn: number }
export interface ChessState { board: (Piece | null)[]; castling: Castling; ep: EnPassant | null }
export interface Move { from: Square; to: Square; promotion?: PromotionType; castle?: 'k' | 'q'; enPassant?: boolean; as?: PieceType }
```
- `rng.ts`: `nextRandom(seed: number): [value: number, nextSeed: number]` (mulberry32), and `shuffle<T>(items: T[], seed: number): [T[], number]` (Fisher–Yates, returns the new seed).
- `fen.ts`: `fromFen(fen: string): { chess: ChessState; toMove: Army }` assigns piece IDs `${army}${type}${n}` in board order. `toFen(chess: ChessState, toMove: Army): string` uses `0` for the halfmove and `1` for the fullmove counters. Both ignore the clocks. `ep.setOnTurn` from FEN is `0`.
- `START_FEN` exported from `fen.ts`.

- [ ] **Step 1: Scaffold the workspace.** Root scripts:
  - `test`: `npm test --workspaces --if-present`
  - `build`: `npm run build -w @isachess/engine && npm run build -w @isachess/web && npm run build -w @isachess/server`
  - `start`: `node packages/server/dist/index.js`

  Install `typescript` and `vitest` as root devDependencies.
- [ ] **Step 2: Write failing tests.**
  - `fen roundtrips START_FEN and Kiwipete`, where Kiwipete is `r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1`. `toFen(fromFen(x))` must equal `x` with the clocks normalised.
  - `fromFen(START_FEN)` gives a white king (`type 'k'`, `army 'w'`) at square 4 and all castling rights true.
  - `shuffle is deterministic for a seed and is a permutation`: the same seed gives equal output; sorted output equals sorted input.
- [ ] **Step 3: Run** `npm test -w @isachess/engine`. Expected: FAIL (modules missing).
- [ ] **Step 4: Implement** `types.ts`, `rng.ts` and `fen.ts`. Export everything from `index.ts`.
- [ ] **Step 5: Run** `npm test -w @isachess/engine`. Expected: PASS.
- [ ] **Step 6: Commit** `chore: scaffold monorepo and engine core types`.

---

### Task 2: Chess move generation with effect context

**Files:**
- Create: `packages/engine/src/chess.ts`
- Test: `packages/engine/test/chess.test.ts`

**Interfaces:**
- Consumes: Task 1 types, `fromFen`.
- Produces:
```ts
export interface MoveContext {
  frozen?: ReadonlySet<string>;      // piece ids that may not move
  shielded?: ReadonlySet<string>;    // piece ids that may not be captured (incl. en passant)
  moved?: ReadonlySet<string>;       // piece ids already moved this card (rule B)
  turn?: number;                     // current turn; en passant needs ep.setOnTurn === turn - 1. Omitted: ep usable.
}
export function isSquareAttacked(chess: ChessState, sq: Square, by: Army): boolean;
export function isInCheck(chess: ChessState, army: Army): boolean;
export function legalMoves(chess: ChessState, army: Army, ctx?: MoveContext): Move[];
export function movesAs(chess: ChessState, from: Square, as: PieceType, ctx?: MoveContext): Move[]; // shapeshift; legal (self-check filtered); never castles, never en passant, never sets ep
export function applyChessMove(chess: ChessState, move: Move, turn: number): { chess: ChessState; captured: Piece | null };
export function findKing(chess: ChessState, army: Army): Square;
```

**Rules for this task:**
- Attacks ignore shields: a shielded piece still gives check.
- Legal means the move doesn't leave the mover's own king attacked (spec §5.1).
- Castling requires all of the following:
  - the castling right is held
  - the squares between king and rook are empty
  - the king isn't in check, and neither the square it crosses nor the square it lands on is attacked
  - neither the king nor that rook is frozen or in `moved`
- Castling is generated as a king move with `castle` set.
- Pawn promotion generates four moves, one for each `PromotionType`.
- **Promotion inside `movesAs`:** when the piece is a real pawn landing on its last rank, generate four promotion moves, whatever `as` is (§5.8). A non-pawn moving as a pawn never promotes.
- **Borrowed pawn movement in `movesAs`:** forward is relative to the piece's army. The two-square step is allowed only from that army's pawn starting rank.
- **`applyChessMove`** does all of the following:
  - updates castling rights when a king or rook moves, or when a rook is captured on its home square
  - sets `ep = { square, capturer: opponent, setOnTurn: turn }` on a real pawn's two-square step, and otherwise sets `ep = null`
  - moves the rook when castling
  - removes the captured pawn on an en passant capture
- En passant is legal only when `chess.ep` exists, `ep.capturer === army`, and (when `ctx.turn` is given) `ep.setOnTurn === ctx.turn - 1`. The perft tests run without a turn.

- [ ] **Step 1: Write failing tests:**
  - **perft** (a recursive count using `legalMoves` and `applyChessMove`, alternating armies, no context):
    - start position: depth 1 = 20, depth 2 = 400, depth 3 = 8902
    - Kiwipete: depth 1 = 48, depth 2 = 2039
    - position 3 `8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1`: depth 1 = 14, depth 2 = 191, depth 3 = 2812
  - `frozen piece has no moves`: freezing the e2 pawn in the start position gives 18 legal moves.
  - `shielded piece cannot be captured`: in `4k3/8/8/3q4/8/8/8/3QK3 w - - 0 1` with the black queen's ID shielded, no white move ends on d5.
  - `shielded attacker still gives check`: in `4k3/8/8/8/8/8/4r3/4K3 w - - 0 1` with the rook shielded, `isInCheck` is true, and no legal move has `to === 12` (e2).
  - `moved set blocks re-moving and castling`: with the rook on h1 in `moved`, there is no kingside castle.
  - `movesAs: boxed-in bishop leaps as knight`: in the start position, the c1 bishop moving as `'n'` gives exactly the moves to b3 and d3.
  - `movesAs: pawn reaching last rank promotes even when moving as a knight`: in `7k/8/1P6/8/8/8/8/7K w - - 0 1`, the b6 pawn moving as `'n'` has 4 promotion variants each to a8 and c8, plus unpromoted moves to d7, d5, a4 and c4.
  - `movesAs: knight moving as pawn onto last rank does not promote`.
  - `movesAs never castles`: a king moving as `'r'` or as `'k'` produces no move with `castle`.
- [ ] **Step 2: Run** `npx vitest run test/chess.test.ts` in `packages/engine`. Expected: FAIL.
- [ ] **Step 3: Implement `chess.ts`.** Generate pseudo-legal moves by piece offsets and rays. Filter self-check by applying the move and calling `isInCheck`.
- [ ] **Step 4: Run the tests.** Expected: PASS, with perft numbers exact.
- [ ] **Step 5: Commit** `feat(engine): chess move generation with freeze/shield/moved context`.

---

### Task 3: Deck and drawing

**Files:**
- Create: `packages/engine/src/deck.ts`
- Test: `packages/engine/test/deck.test.ts`

**Interfaces (Produces):**
```ts
export type Colour = 'red' | 'yellow' | 'green' | 'blue';
export type CardKind = 'num' | 'skip' | 'reverse' | 'draw2' | 'wild' | 'wild4';
export interface Card { id: string; kind: CardKind; colour: Colour | null; value?: number } // value 0–9 only for 'num'; ids 'c0'..'c107'
export function buildDeck(): Card[];
export interface Piles { drawPile: Card[]; discardPile: Card[]; seed: number }
export function drawCards(piles: Piles, n: number): { cards: Card[]; piles: Piles };
```
Add `Colour`, `CardKind` and `Card` to `types.ts`.

**`drawCards` behaviour:** when the draw pile is empty, shuffle every discard except the top one (the last element) into a new draw pile using `piles.seed`. If cards are still short, return fewer than `n`.

- [ ] **Step 1: Write failing tests:**
  - `deck has 108 cards`, with these counts:
    - `num` value 0: 4
    - each value 1–9: 8
    - skip: 8, reverse: 8, draw2: 8
    - wild: 4 with colour null
    - wild4: 4 with colour null
    - all IDs unique
  - `drawing from an empty draw pile reshuffles the discard pile but keeps the top card`
  - `drawing more than exists returns what exists`: with a draw pile of 1, a discard pile of 2, and n = 5, it returns 2 cards and leaves the discard pile at length 1.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** `buildDeck` and `drawCards`.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(engine): card deck and drawing with reshuffle`.

---

### Task 4: Game state, turn flow, move cards, check and mate

**Files:**
- Create: `packages/engine/src/game.ts`, `packages/engine/src/cards.ts` (only `playableCards` in this task)
- Test: `packages/engine/test/game.test.ts`, `packages/engine/test/helpers.ts`

**Interfaces (Produces), with types added to `types.ts`:**
```ts
export type Phase =
  | { kind: 'awaitingCard' }
  | { kind: 'moving'; cardId: string; movesLeft: number; moved: string[]; mustMove: boolean }
  | { kind: 'over'; winner: PlayerId | null; reason: 'checkmate' | 'stalemate' | 'resign' };
export interface Effects {
  frozen: { pieceId: string; army: Army }[];
  shields: { pieceId: string; owner: PlayerId }[];
  pendingSkip: PlayerId | null;
}
export interface GameEvent { turn: number; player: PlayerId; text: string } // public text only
export interface GameState {
  chess: ChessState;
  captured: { w: PieceType[]; b: PieceType[] };   // pieces OF that army that were captured
  players: [PlayerId, PlayerId];                   // [initial white, initial black]
  seats: { w: PlayerId; b: PlayerId };
  hands: Record<PlayerId, Card[]>;
  drawPile: Card[]; discardPile: Card[]; seed: number;
  current: PlayerId; turn: number; phase: Phase; effects: Effects;
  nextPieceId: number; log: GameEvent[];
}
export type EffectArgs =
  | { type: 'swap'; a: string; b: string }
  | { type: 'freeze'; pieceId: string }
  | { type: 'shield'; pieceId: string }
  | { type: 'shapeshift'; pieceId: string; as: PieceType; to: Square; promotion?: PromotionType }
  | { type: 'revive'; capturedIndex: number; square: Square; asQueen?: boolean };
export type Action =
  | { type: 'playCard'; cardId: string; asOne?: boolean; args?: EffectArgs }
  | { type: 'move'; from: Square; to: Square; promotion?: PromotionType }
  | { type: 'doneMoving' }
  | { type: 'resign' };
export type ApplyResult = { ok: true; state: GameState; events: GameEvent[] } | { ok: false; error: string };
```
In `game.ts`:
```ts
export function createGame(seed: number, white: PlayerId, black: PlayerId): GameState;
export function apply(state: GameState, player: PlayerId, action: Action): ApplyResult;
export function armyOf(state: GameState, player: PlayerId): Army;
export function opponentOf(state: GameState, player: PlayerId): PlayerId;
export function inCheckNow(state: GameState): boolean;   // current player's army
```
In `cards.ts`:
```ts
export function playableCards(state: GameState, player: PlayerId): { cardId: string; asEffect: boolean; asOne: boolean }[];
```
- `test/helpers.ts`: `stateFrom(fen: string, hands: { w: Card[]; b: Card[] }, opts?: Partial<GameState>): GameState` builds a game with the players `'A'` (white) and `'B'` (black), sets `current` from the FEN side, and uses a draw pile of 20 `num 0` cards. `card(kind, value?)` makes a card with a unique ID.

**Turn flow (in `game.ts`):**
- **`playCard`:**
  1. Reject the card if it isn't in the player's hand, if it isn't the player's turn, or if the phase isn't `awaitingCard`.
  2. Validate against `playableCards`.
  3. Move the card from the hand to the top of the discard pile and log it.
  4. Resolve it:
     - A card played **as a 1**, or a **1–5** card: phase becomes `moving` with `movesLeft` = 1 or the value, and `mustMove` = in check now. If no legal move exists for unmoved pieces, end the card immediately.
     - **0**: end the card.
     - **Other kinds:** handled in Tasks 5 and 6. Until then, return `{ ok: false, error: 'Not implemented' }`.
- **`move`** (only in the `moving` phase):
  - The move must be in `legalMoves(chess, army, {frozen, shielded, moved, turn})`. A promotion is required when legal moves to that square carry one; if it's missing, return the error `"Choose a promotion piece"`.
  - Apply the move and record the captured piece's type in `captured[its army]`.
  - Add the mover's ID to `moved`. On castling, add the rook's ID too.
  - Decrement `movesLeft` and set `mustMove = false`.
  - If the opponent army is now in check, log `"Check!"` and end the card (rule A).
  - Otherwise, if `movesLeft === 0` or no legal moves remain, end the card.
- **`doneMoving`:** only in the `moving` phase with `!mustMove`. Ends the card.
- **`resign`:** any player, any non-over phase. Phase becomes `over`, and the winner is the opponent.
- **End the card** (shared by all cards):
  1. Draw step: draw 1 if the hand has fewer than 7 cards.
  2. Remove `frozen` entries whose `army === armyOf(current)`. This turn was played by that army.
  3. Clear `ep` if `ep.setOnTurn !== turn`.
  4. Advance: `turn += 1`, and `current = opponent`.
  5. **Start a turn** for `current`:
     - Remove shields owned by `current`.
     - If `pendingSkip === current`, clear it, log `"<player> is skipped"`, clear `ep` (the skipped turn ends), set `turn += 1` and `current = the other player`, then repeat this start-of-turn step.
  6. **Evaluate the result for the army of `current`:**
     - In check, with no `legalMoves` given `{frozen, shielded}`: phase `over`, `checkmate`, and the winner is the other player.
     - Not in check, with no `legalMoves` given `{shielded}` (freezes ignored): phase `over`, `stalemate`, no winner.
     - Otherwise: phase `awaitingCard`.
- **`playableCards`** (this task's part):
  - Not in check: every card has `asEffect: true` and `asOne: false`.
  - In check: `asOne: true` for every card. `asEffect` is true only for `num` 1–5. The 6, 8 and wild cases are added in Tasks 5 and 6.
- Every rejection returns `{ ok: false, error }` with a short human sentence and leaves the input state untouched.

- [ ] **Step 1: Write failing tests:**
  - `createGame deals 7 each, 94 in draw pile, white to move, players[0] is white`.
  - `0 card: no moves, draws back to 7, turn passes`.
  - `card 3: three different pieces move, then turn passes`.
  - `rule B: same piece cannot move twice` (error contains "already moved").
  - `rule A: giving check ends the turn with moves left`. Use 4 cards, and give check on move 2; afterwards the phase is `awaitingCard` for `'B'`.
  - `rule C / §5.3: in check, a 0 can only be played asOne`:
    - `playCard` of a 0 without `asOne` returns an error.
    - With `asOne`, the phase is `moving` with `movesLeft: 1` and `mustMove: true`.
    - `doneMoving` is rejected.
  - `doneMoving ends a 4-card after 1 move`.
  - `checkmate by the board`: from `rnbqkbnr/pppp1ppp/8/4p3/6P1/5P2/PPPPP2P/RNBQKBNR b KQkq - 0 1`, B plays a 1 and moves d8→h4. The phase is `over`, `checkmate`, with winner `'B'`.
  - `frozen escape piece counts for checkmate`: from `6k1/R7/8/8/8/8/r5PP/7K b - - 0 1` with the a7 rook in `effects.frozen` (army `'w'`), B plays a 1 and moves a2→a1. The result is checkmate. Without the freeze, it is `awaitingCard` (Rxa1 escapes).
  - `stalemate ignores freeze`: from `7k/8/8/8/8/p7/P7/K7 b - - 0 1` with the white king frozen, B plays a 0. White's phase is `awaitingCard`, not stalemate.
  - `stalemate`: from `7k/4Q3/6K1/8/8/8/8/8 w - - 0 1`, A plays a 1 and moves e7→f7. The phase is `over`, `stalemate`, winner null.
  - `promotion without piece is rejected` with exactly `"Choose a promotion piece"`.
  - `en passant only on the immediately following turn`.
  - `castling counts as king's move and marks the rook moved`.
  - `resign: either player, even off-turn`.
  - `stale action rejected and state unchanged`: send the same `move` twice. The second call returns `ok: false`, and the input object deep-equals its snapshot from before the call.
  - `draw step does not draw when hand >= 7`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** `createGame`, `apply` (playCard for num 0–5 and asOne, move, doneMoving, resign), end-card and start-turn logic, and `playableCards`. Use `structuredClone` for copy-on-write.
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(engine): turn flow, move cards, check, mate, stalemate`.

---

### Task 5: Swap, Freeze, Shield, Trade, Reverse, Draw Two, Draw Four

**Files:**
- Modify: `packages/engine/src/game.ts`, `packages/engine/src/cards.ts`
- Test: `packages/engine/test/cards.test.ts`

**Interfaces (Produces), in `cards.ts`:**
```ts
export function legalSwaps(state: GameState, player: PlayerId): [string, string][];   // unordered pairs, a < b
export function legalFreezeTargets(state: GameState, player: PlayerId): string[];    // any enemy piece incl. king
export function legalShieldTargets(state: GameState, player: PlayerId): string[];    // own non-king pieces
```

**Rules:**
- **Swap (6):** two of your own pieces exchange squares. Illegal if any of these hold:
  - it would leave your own king in check
  - it would give check
  - it would put a pawn on its own last rank

  Swapping a king or rook clears the matching castling rights.
- **Freeze (7):** add `{pieceId, army: target's army}` to `effects.frozen`.
- **Shield (skip):** add `{pieceId, owner: player}` to `effects.shields`. No moves.
- **Trade Hands (9):** swap `hands[A]` and `hands[B]` after the 9 has left the player's hand. Then run the draw step as usual.
- **Reverse:** swap `seats.w` and `seats.b`, then end the card. Castling rights, captured pieces and effects stay with armies (§5.4).
- **Draw Two / Draw Four:** the opponent draws 2 or 4 via `drawCards`, and `effects.pendingSkip = opponent`. End the card. The skip is applied at the start of their turn (Task 4).
- When `args` is missing or names an illegal target for Swap, Freeze or Shield:
  - If the legal list is non-empty, reject with an error.
  - If it is empty and the player is not in check, the card resolves with no effect (plan decision 2).
- **`playableCards` in check:** `asEffect` is true for the 6 when `legalSwaps` is non-empty. Because swaps are self-check filtered, every legal swap in check escapes the check.

- [ ] **Step 1: Write failing tests:**
  - `swap rook and king (rulebook p.4)`: the squares are exchanged and white's castling rights are cleared.
  - `swap may not give check`.
  - `swap may not leave own king in check`.
  - `swap may not put pawn on last rank`.
  - `swap that escapes check is playable asEffect in check`.
  - `freeze: frozen black queen has no moves on black's next turn, and moves again the turn after`.
  - `freeze carries over a skipped turn (§5.11)`: A freezes; on A's next turn A plays a draw2; B is skipped; A plays a 0; B's queen is still frozen on B's played turn; after that it's released.
  - `shield: shielded queen cannot be captured until shield owner's next turn starts`.
  - `shield expires at the start of a skipped turn too (§5.12)`.
  - `shield cannot target king`.
  - `trade hands: hands swap; the 9 is not in either hand`.
  - `reverse: B moves next, controlling white; armies keep castling rights`.
  - `draw2: opponent gets +2, is skipped, A plays again`.
  - `wild4: opponent gets +4, is skipped`.
  - `hand over 7 does not draw (§5.9)`: B has 11 cards after a +4. B plays a card and has 10, no draw. This continues until B plays down to 6, then draws to 7.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement** the legal-target functions and resolution in `apply`.
- [ ] **Step 4: Run** all engine tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(engine): swap, freeze, shield, trade, reverse, draw cards`.

---

### Task 6: Shapeshift and Revive

**Files:**
- Modify: `packages/engine/src/game.ts`, `packages/engine/src/cards.ts`
- Test: `packages/engine/test/shapeshift-revive.test.ts`

**Interfaces (Produces), in `cards.ts`:**
```ts
export interface ShapeshiftOption { pieceId: string; as: PieceType; to: Square; promotion?: PromotionType }
export function legalShapeshifts(state: GameState, player: PlayerId): ShapeshiftOption[]; // via movesAs with {frozen, shielded}; as !== own type
export interface ReviveOption { capturedIndex: number; square: Square; asQueen: boolean }
export function legalRevives(state: GameState, player: PlayerId): ReviveOption[];
```

**Rules:**
- **Shapeshift (8):** one move using `movesAs`. It is treated as a single move: apply it, record any capture, and if it gives check, log `"Check!"`. Then end the card. Promotion follows §5.8, and a missing promotion gives the error `"Choose a promotion piece"`.
- **Revive (wild):** `captured[myArmy][capturedIndex]` returns to an empty square in "your first two rows":
  - ranks 1–2 for white
  - ranks 7–8 for black

  Further rules:
  - Pawns are allowed on the first row.
  - `asQueen` is allowed only when the captured type is `'p'`, and both options are offered.
  - It may not give check and may not leave your own king in check.
  - The revived piece gets the ID `r${nextPieceId++}`.
  - Remove the entry from `captured`. Castling rights are not restored.
  - Nothing captured: no effect (spec §4).
- **`playableCards` in check:** `asEffect` for the 8 when `legalShapeshifts` is non-empty, and for the wild when `legalRevives` is non-empty. Both are self-check filtered, so they escape the check.

- [ ] **Step 1: Write failing tests:**
  - `shapeshift: boxed-in bishop leaps like a knight (rulebook p.4)`.
  - `shapeshift: piece is itself again next turn`: on the next move card the bishop has only bishop moves.
  - `shapeshift: pawn moving as knight to last rank promotes`.
  - `shapeshift: knight moving as pawn to last rank stays a knight`.
  - `shapeshift giving check ends turn and is legal`.
  - `shapeshift cannot capture shielded piece`.
  - `revive: legal squares are empty squares in own first two rows, excluding a square that would give check (rulebook p.4 diagram)`. Build this position: the black king is on c8, the c-file is open, and a white queen is being revived. Assert that c1 and c2 are absent and that b1 and d1 are present.
  - `revive: captured pawn may return as queen; captured knight returns as knight only`.
  - `revive: nothing captured → card resolves with no effect and turn passes`.
  - `revive that blocks check is playable asEffect in check`.
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** all engine tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(engine): shapeshift and revive`.

---

### Task 7: Player view, legal options, protocol types

**Files:**
- Create: `packages/engine/src/view.ts`, `packages/engine/src/protocol.ts`
- Test: `packages/engine/test/view.test.ts`

**Interfaces (Produces):**
```ts
export interface PlayerView {
  you: PlayerId; opponent: PlayerId; yourArmy: Army;
  chess: ChessState; captured: GameState['captured']; effects: Effects;
  hand: Card[]; opponentHandCount: number; drawPileCount: number; topDiscard: Card | null;
  current: PlayerId; turn: number; phase: Phase; inCheck: Army | null;
  log: GameEvent[];        // last 50
  options: LegalOptions;   // empty lists when it is not your turn
}
export interface LegalOptions {
  cards: { cardId: string; asEffect: boolean; asOne: boolean }[];
  moves: Move[];           // in 'moving' phase: legal moves for this step
  canDoneMoving: boolean;
  swaps: [string, string][]; freezeTargets: string[]; shieldTargets: string[];
  shapeshifts: ShapeshiftOption[]; revives: ReviveOption[];
}
export function viewFor(state: GameState, player: PlayerId): PlayerView;
export function legalOptions(state: GameState, player: PlayerId): LegalOptions;
```
`protocol.ts`:
```ts
export interface RoomInfo { names: Record<PlayerId, string>; opponentConnected: boolean; rematch: { you: boolean; opponent: boolean } }
export type ClientMessage =
  | { type: 'join'; gameId: string; nickname: string; seatToken?: string }
  | { type: 'action'; action: Action }
  | { type: 'rematch' };
export type ServerMessage =
  | { type: 'joined'; gameId: string; seatToken: string; playerId: PlayerId }
  | { type: 'lobby'; gameId: string; names: string[] }          // waiting for the 2nd player
  | { type: 'state'; view: PlayerView; room: RoomInfo }
  | { type: 'error'; message: string }
  | { type: 'gone'; reason: 'not-found' | 'full' };
```
These replace the spec's separate `presence` message: presence travels inside `room`.

- [ ] **Step 1: Write failing tests:**
  - `viewFor hides opponent hand and draw pile`: `JSON.stringify(viewFor(s,'A'))` contains none of B's card IDs and none of the draw-pile card IDs. Only `topDiscard` from the discard pile may appear.
  - `options are empty when not your turn`.
  - `options.moves in moving phase excludes already-moved pieces`.
  - `log events never mention card contents of hands` (after a Trade Hands, the event text has no card IDs).
- [ ] **Step 2: Run.** Expected: FAIL.
- [ ] **Step 3: Implement.** Export `view.ts` and `protocol.ts` from `index.ts`. Add the engine `build` script (`tsc -p tsconfig.json` → `dist`).
- [ ] **Step 4: Run** `npm test -w @isachess/engine && npm run build -w @isachess/engine`. Expected: PASS, and `dist/index.js` exists.
- [ ] **Step 5: Commit** `feat(engine): player view, legal options, protocol types`.

---

### Task 8: Server: rooms, HTTP, WebSockets

**Files:**
- Create: `packages/server/{package.json,tsconfig.json,vitest.config.ts}`, `src/{index,rooms,http,ws}.ts`
- Test: `packages/server/test/rooms.test.ts`, `packages/server/test/ws.test.ts`

**Interfaces:**
- Consumes: `createGame`, `apply`, `viewFor`, protocol types.
- Produces:
```ts
// rooms.ts
export class Rooms {
  constructor(opts?: { seed?: () => number; now?: () => number });
  create(nickname: string): { gameId: string; seatToken: string; playerId: PlayerId };
  join(gameId: string, nickname: string, seatToken?: string):
    | { ok: true; playerId: PlayerId; seatToken: string } | { ok: false; reason: 'not-found' | 'full' };
  act(gameId: string, playerId: PlayerId, action: Action): { ok: true } | { ok: false; error: string };
  rematch(gameId: string, playerId: PlayerId): void;
  cleanup(maxIdleMs: number): void;
  get(gameId: string): Room | undefined;
}
// index.ts
export function start(port: number, opts?: { staticDir?: string; seed?: () => number }): Promise<{ port: number; close(): Promise<void> }>;
```

**Behaviour:**
- **IDs:**
  - `gameId`: 6 characters from `abcdefghjkmnpqrstuvwxyz23456789`, using `crypto.randomInt`.
  - `seatToken`: `crypto.randomBytes(24).toString('base64url')`.
  - `playerId`: `crypto.randomUUID()`.
- **Joining:**
  - The creator is seated at `create`.
  - A `join` with a matching token reattaches to that seat.
  - Otherwise the first `join` without a token takes the free seat, and the game starts with `createGame(seed(), creator, joiner)`.
  - Any further join returns `full`.
- **Seed:** `opts.seed` if given, otherwise the env var `ISACHESS_SEED` (a number) if set, otherwise `crypto.randomInt(2**31)`.
- **Rematch:** when both players have voted, start `createGame(seed(), previous players[1], previous players[0])`.
- **WebSockets** are attached at path `/ws`. On every change, each socket attached to a seat gets its own `state`:
  - after a successful `act`
  - after a join or reconnect
  - on disconnect (the `opponentConnected` flag changes)
  - after a rematch vote

  A failed `act` sends `error` to that socket only.
- **Malformed messages:** invalid JSON, an unknown `type`, or a missing `gameId` or `action` get `error` with `"Bad message"`. The socket stays open.
- **HTTP:**
  - `POST /api/games` with the JSON body `{nickname}` (1–20 characters, trimmed, otherwise 400) returns `{gameId, seatToken, playerId}`.
  - With `staticDir`, serve files from it and return `index.html` for any other GET (SPA fallback).
- **Cleanup:** `setInterval` every hour runs `cleanup(24h)`. `lastActivity` updates on every message.
- `src/index.ts` runs `start(Number(process.env.PORT ?? 3000), { staticDir: <repo>/packages/web/dist })` when executed directly.

- [ ] **Step 1: Write failing tests:**
  - `rooms.test.ts`:
    - `create + join starts a game`
    - `third join is full`
    - `reconnect with token keeps seat`
    - `rematch needs both votes and swaps colours`
    - `cleanup removes idle rooms` (inject `now`)
  - `ws.test.ts`, using `start(0, { seed: () => 42 })` and real `ws` clients:
    - `two clients play a scripted opening`:
      1. A POSTs to create, B joins.
      2. A plays a move card from its hand (pick the first `num` 1–5 in `view.hand`), moves, and ends.
      3. Both receive a `state` whose `turn` advanced.
    - `neither client ever receives the other's hand or draw pile ids` (collect every message across the scripted game and assert against the server's true state).
    - `stale action rejected without crashing`: the same move twice gives an `error`, and the next valid action still works.
    - `malformed messages get "Bad message" and socket stays open` (send `"{"`, `{"type":"nope"}`, and `{"type":"action"}`).
    - `refresh mid-turn restores moving phase`: A plays a 2+ card and makes one move, closes the socket, then rejoins with the token. The new `view.phase` is `moving` with the same `movesLeft`.
    - `two tabs on one seat both receive state`.
- [ ] **Step 2: Run** `npm test -w @isachess/server`. Expected: FAIL.
- [ ] **Step 3: Implement** `rooms.ts`, `http.ts`, `ws.ts` and `index.ts`. Add the `build` script (`tsc` → `dist`) and the `dev` script (`tsx watch src/index.ts`).
- [ ] **Step 4: Run.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(server): rooms, http api, websocket game protocol`.

---

### Task 9: Web shell: home page, routing, socket hook

**Files:**
- Create: `packages/web/{package.json,tsconfig.json,vite.config.ts,index.html}`, `src/{main.tsx,App.tsx,api.ts,seat.ts,useGame.ts,styles.css}`, `src/components/Home.tsx`

**Interfaces (Produces):**
```ts
// api.ts
export function createGame(nickname: string): Promise<{ gameId: string; seatToken: string; playerId: string }>;
// seat.ts — cookie name `uc_${gameId}`, path "/", max-age 7 days, SameSite=Lax
export function getSeat(gameId: string): string | undefined;
export function setSeat(gameId: string, token: string): void;
// useGame.ts
export type GameConn =
  | { status: 'connecting' | 'reconnecting' }
  | { status: 'lobby'; names: string[] }
  | { status: 'playing'; view: PlayerView; room: RoomInfo }
  | { status: 'gone'; reason: 'not-found' | 'full' };
export function useGame(gameId: string, nickname: string | null): {
  conn: GameConn; send(action: Action): void; rematch(): void; lastError: string | null;
};
```

**Behaviour:**
- **Vite:** the dev server proxies `/api` and `/ws` (with `ws: true`) to `localhost:3000`, and aliases `@isachess/engine` to its source.
- **Home (`/`):** a nickname field (saved in `localStorage` under `uc_nick`) and a **New game** button. It calls `createGame`, then `setSeat`, then navigates to `/g/:id`.
- **Game route (`/g/:id`):**
  - If there's no seat cookie and no saved nickname, ask for a nickname first.
  - `useGame` opens `ws(s)://<host>/ws`, sends `join` with any saved token, and stores the token from `joined`.
  - Reconnect backoff: 1, 2, 4 and 8 seconds, capped at 8.
  - `gone` means stop reconnecting. `not-found` goes back home with the note "That game doesn't exist any more." `full` shows "This game is full."
- **Lobby screen:** "Waiting for your friend…" with the full link and a **Copy link** button.
- Routing uses `location.pathname` and `history.pushState`. There is no router library.

- [ ] **Step 1: Implement** the files above. There is no unit test for this glue; it's covered by the e2e test in Task 11.
- [ ] **Step 2: Verify:** run `npm run build -w @isachess/web` and expect success. Then run `npm run dev -w @isachess/server` and `npm run dev -w @isachess/web`, open two browser contexts with Playwright (or by hand), create a game and join it. Both should leave the lobby.
- [ ] **Step 3: Commit** `feat(web): home page, routing, game socket hook`.

---

### Task 10: Web game screen and card interactions

**Files:**
- Create: `packages/web/src/interaction.ts`, `src/components/{Game,Board,Hand,CardView,StatusBar,Log,PromotionPicker,ShapeshiftPicker,RevivePicker,GameOver,Toast}.tsx`
- Test: `packages/web/test/interaction.test.ts` (Vitest, node environment)

**Interfaces (Produces), in `interaction.ts`, a pure reducer:**
```ts
export type Selection =
  | { kind: 'idle' }
  | { kind: 'cardChosen'; cardId: string; asOne: boolean; picks: string[]; square?: Square; as?: PieceType; capturedIndex?: number; asQueen?: boolean }
  | { kind: 'pieceChosen'; from: Square };            // during 'moving'
export type UiEvent =
  | { type: 'clickCard'; cardId: string; asOne: boolean }
  | { type: 'clickSquare'; sq: Square }
  | { type: 'chooseType'; as: PieceType }
  | { type: 'chooseCaptured'; index: number; asQueen: boolean }
  | { type: 'choosePromotion'; p: PromotionType }
  | { type: 'cancel' };
export function step(view: PlayerView, sel: Selection, ev: UiEvent):
  { sel: Selection; send?: Action; needPromotion?: { from: Square; to: Square } };
export function highlights(view: PlayerView, sel: Selection): { selectable: Square[]; targets: Square[] };
```

**Card flows**, all driven by `view.options`:
- **Cards with no target** (0, 9, reverse, draw2, wild4, num 1–5, asOne): send `playCard` on click.
- **Swap:** two piece clicks within `options.swaps`.
- **Freeze and Shield:** one piece click.
- **Shapeshift:**
  1. Click a piece.
  2. Choose a type in `ShapeshiftPicker` (only the types with options are shown).
  3. Click a target square. If the option has promotion variants, use `PromotionPicker`.
- **Revive:**
  1. Choose a captured piece in `RevivePicker` (a pawn shows "Pawn" and "Queen").
  2. Click a target square.
- **Effect cards with no legal target:** if the relevant options list is empty, send `playCard` without `args` immediately.
- **`moving` phase:** click a piece, then a highlighted target square. Use `PromotionPicker` when needed. A **Done moving** button appears when `options.canDoneMoving`.
- **In check:** cards with only `asOne` show a "play as 1" badge, and clicking one sends `asOne: true`.

**Screen layout:**
- The board is oriented to `view.yourArmy`, with pieces as Unicode glyphs and a ❄ badge for frozen and a ring for shielded pieces.
- The hand is a row of coloured cards with a value or symbol. Special cards are dark.
- The opponent's card count is shown face down, along with the draw pile count and the top discard.
- The status line text:
  - `"Your turn: play a card"`
  - `"Card {n}: move {k} of {n}"`
  - `"Opponent's turn"`
  - `"You are in check!"`
  - `"Opponent disconnected, waiting…"`
- Also on screen: captured pieces, the log (newest first), errors as a toast that auto-hides after 3 seconds, and a `GameOver` overlay with the result and the **Rematch** button (it shows "Waiting for opponent…" after you vote).
- Layout works down to a 375px width: the board scales to fit, and the hand scrolls horizontally.
- Add these `data-testid` attributes for e2e: `card-<cardId>`, `sq-<0..63>`, `done-moving`, `status`, `copy-link`, `rematch`.

- [ ] **Step 1: Write failing tests** in `interaction.test.ts`, using `viewFor` on engine states built with the engine's test helpers. Copy the helpers into the web test or import them via a relative path.
  - `clicking a move card sends playCard`.
  - `swap needs two picks, then sends args {type:'swap', a, b}`.
  - `shapeshift flow: piece → type → square sends shapeshift args`.
  - `revive flow with pawn asQueen`.
  - `moving phase: piece then target sends move; promotion target asks needPromotion`.
  - `effect card with empty options sends playCard without args`.
  - `cancel returns to idle`.
- [ ] **Step 2: Run** `npm test -w @isachess/web`. Expected: FAIL.
- [ ] **Step 3: Implement** `interaction.ts`, then the components.
- [ ] **Step 4: Run** the tests (expected: PASS) and `npm run build -w @isachess/web` (expected: success).
- [ ] **Step 5: Commit** `feat(web): game screen and card interactions`.

---

### Task 11: End-to-end test, production build, deployment

**Files:**
- Create: `e2e/playwright.config.ts`, `e2e/game.spec.ts`, `render.yaml`, `README.md`
- Modify: root `package.json` (add `e2e` script and `@playwright/test` devDependency)

**Behaviour:**
- **Playwright config:**
  - `webServer` runs `npm run build && ISACHESS_SEED=<seed> PORT=4173 npm start` with `url: http://localhost:4173`.
  - `use.launchOptions.executablePath: '/opt/pw-browsers/chromium'`, Chromium only.
- **`<seed>`:** choose and record a seed for which White's opening hand contains a 2–5 card and a 6. Find it with a short script over `createGame(seed, …)`, and put a comment in the spec file saying why the seed was chosen.
- **`render.yaml`:** one `web` service with `env: node`, `buildCommand: npm ci && npm run build`, `startCommand: npm start`, and `healthCheckPath: /`.
- **`README.md`:**
  - what the game is (link to the spec)
  - `npm install`, `npm test`, and how to run the dev servers
  - `npm run e2e`
  - Deploy to Render:
    1. Create a Render account.
    2. New, then Blueprint, then pick this GitHub repo.
    3. Render reads `render.yaml`.
    4. Share the `onrender.com` URL.
  - A note that free instances sleep when idle and restart (in-progress games are lost, per spec §1).

- [ ] **Step 1: Write the failing e2e test** `two players create, join, and play`:
  1. Context A opens `/`, enters "Alice", clicks New game, and reads the link from `copy-link`'s data attribute.
  2. Context B opens the link and enters "Bob".
  3. Both contexts show `status`.
  4. A plays the 2–5 card, moves one piece (the first `sq-*` with the selectable class, then the first target), and clicks `done-moving`. B's status becomes "Your turn: play a card".
  5. B plays any card that sends without targets (a 0 if present; otherwise the first card with options, completing its flow) to hand the turn back.
  6. A plays the 6 and clicks two of its pieces. Assert the two `sq-*` cells swapped glyphs.
  7. Reload A's page. A's hand count and board are unchanged.
- [ ] **Step 2: Run** `npm run e2e`. Expected: FAIL until the seed and selectors line up. Fix the test, not the app, unless the failure shows a real app bug.
- [ ] **Step 3: Make it pass.** Run the full suite: `npm test && npm run e2e`. Expected: all PASS.
- [ ] **Step 4: Production smoke test:** `npm run build && PORT=3000 npm start`, then `curl -s localhost:3000/ | grep -q '<div id="root"'` and `curl -s -XPOST localhost:3000/api/games -H 'content-type: application/json' -d '{"nickname":"x"}'` returns JSON with a `gameId`.
- [ ] **Step 5: Commit** `test: end-to-end game; chore: render deployment and README`.
