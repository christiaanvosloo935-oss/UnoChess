# IsaChess Online — Design Spec

**Date:** 2026-10-13
**Status:** Approved in conversation, awaiting written-spec review

Three-player mode extends this spec: see 2026-10-15-three-player-design.md.

**Source rules:** *IsaChess — House Rules, v1.0* (Christiaan, October 2026)

## 1. Goal

A browser-based online version of IsaChess so two friends on separate devices can play
each other by sharing a link. Version 1 exists to play-test the house rules with friends:
quick to start, no sign-up, and strict enforcement of every rule so nobody has to argue
about edge cases.

### In scope (v1)
- Private games created from the home page and joined by link.
- Nickname only; no accounts.
- Full enforcement of the house rules (Section 4) and the clarifications agreed in Section 5.
- Hidden hands enforced by the server.
- Reconnect to your seat after refresh or a dropped connection.
- Resign, game-over screen, rematch.

### Out of scope (v1)
Accounts, lobby, matchmaking, chat, computer opponent, chess clocks, spectators,
game history, persistence across server restarts, 50-move rule, threefold repetition.

## 2. Architecture

A TypeScript monorepo (npm workspaces) with three packages:

```
packages/
  engine/   Pure rules: board, legal moves, cards, turn flow. No network, no UI, no I/O.
  server/   Node + WebSockets. Holds live games in memory; validates every action via engine.
  web/      React app (Vite): home page, game page.
```

- `web` depends on `engine` only for types and for client-side highlighting of legal
  options. The server is always the authority.
- `server` depends on `engine`, and in production also serves the built `web` assets,
  so the whole app deploys as one service.
- Hosting: one Render web service. Deployment instructions ship in `README.md`; the
  owner creates the Render account and connects the repository.

## 3. Player experience

1. **Create.** On the home page, enter a nickname and click **New game**. You get a link like
   `/g/7xk2pq` and are seated as White.
2. **Join.** The second visitor to the link enters a nickname and is seated as Black.
   The deck is shuffled, 7 cards are dealt to each player, and White plays first.
   Any further visitor sees "This game is full."
3. **Game screen** shows:
   - the board, oriented to the army you currently control (it flips after Reverse)
   - your hand, face up
   - the opponent's card count, face down
   - the draw pile count and the top discard
   - a status line (e.g. "Your turn: play a card", "Card 4: move 2 of 4")
   - captured pieces
   - active effects (frozen ❄, shielded ◯) drawn on the pieces
   - a short event log
4. **Playing a card.** Click a card, then follow the prompts for its effect:
   - Move cards (1–5): legal destination squares are highlighted, with a counter of
     moves left. Pieces that have used both of their moves this turn are greyed out.
     A **Done moving** button ends the turn early.
   - 6 Swap: pick two of your pieces.
   - 7 Freeze: pick an enemy piece.
   - Skip / Shield: pick one of your non-king pieces.
   - 8 Shapeshift: pick a piece, then a piece type to borrow, then a destination.
   - Wild / Revive: pick a captured piece (a captured pawn may come back as a pawn or a
     queen), then a highlighted legal square.
   - 0, 9, Reverse, +2, +4: take effect immediately.
   - Promotion: a picker for queen, rook, bishop or knight.
5. **Reconnect.** A seat token is stored in a cookie for that game. Re-opening the link
   puts you back in your seat. While a player is disconnected, the other sees
   "Opponent disconnected, waiting…" and the game stays where it is.
6. **End.** Checkmate, stalemate or resignation shows a game-over panel with
   a **Rematch** button. A rematch reshuffles, redeals, and swaps colours.

## 4. Rules (from the rulebook)

**Setup.** Standard chessboard and pieces in the normal starting position. A standard
114-card deck: one 0 per colour, two each of 1–9 per colour, two Skip, two Reverse
and two Draw Two per colour, four Wild and four Wild Draw Four, plus six extra move
cards (one extra each of 1, 2, 4 and 5 and two extra 3s, so there are 46 cards numbered
1–5 instead of 40). Each player draws 7.
The rest is the draw pile. White goes first.

**Turn.** PLAY one card (colour and number never matter) → ACT (carry out its effect) →
DRAW (see §5.7).

| Card | Effect |
|---|---|
| 0 · Rest | No moves this turn. |
| 1–5 · Moves | Make that many moves, one after another (multi-move rules below). |
| 6 · Swap | Swap the positions of any two of your own pieces. |
| 7 · Freeze | One enemy piece can't move on the opponent's next turn. It can still be captured. |
| 8 · Shapeshift | One of your pieces makes one move as any other piece type. Normal blocking applies. |
| 9 · Trade Hands | Swap whole hands with your opponent. |
| Shield | One of your pieces (not the king) can't be captured until the start of your next turn. No moves this turn. A shielded piece can still be frozen or swapped. |
| Switch Sides | Players swap armies; each keeps their own hand. |
| Draw Two | Opponent draws 2 and skips their next turn. |
| Revive | Return one of your captured pieces to any empty square in your first two rows (pawns allowed on the first row). It may not give check. Only a captured pawn may return as a queen; everything else returns as itself. No effect if nothing has been captured. |
| Draw Four | Opponent draws 4 and skips their next turn. |

**Multi-move rules (cards 1–5).**
- A. Check ends your turn: the moment you give check, remaining moves are lost.
- B. Each piece moves at most twice per card.
- C. If you start your turn in check, your first move must get out of check.

**Winning.** Checkmate wins. Running out of cards never ends the game.
**Empty draw pile.** Shuffle the discard pile, except its top card, into a new draw pile.

## 5. Agreed clarifications

These are decisions made with the rules author in conversation. They are binding for the
engine and every one gets a test.

1. **No self-check.** No move or effect may leave your own king in check. This also
   applies to every individual step of a multi-move card.
2. **Checkmate is decided by the board.** A player is checkmated when they are in check
   and have no legal *ordinary* chess move that gets them out, whatever is in their hand.
   Active effects count as board state: frozen pieces can't be used to escape, and a
   shielded attacker can't be captured.
3. **In check, the card must get you out.** While in check, a player may play a card for
   its effect only if that effect resolves the check. That means a move card's first move
   (rule C), a Shapeshift move, a Swap, or a Revive that blocks. Cards that make no move
   (0, Shield, Freeze, 9, Draw Two, Draw Four, Reverse) can't be played for their effect
   while in check. Instead, **any card may be played as a "1"** to make one escaping move.
   This fallback is always available, so a player who is in check but not checkmated can
   always continue.
4. **Reverse.** Players always take turns in alternation. After player A plays Reverse,
   player B moves next, controlling A's old army. Reverse makes no chess move. Castling
   rights, captured pieces and effects belong to the *armies*, not the players.
5. **Castling, en passant and promotion** follow normal chess. Castling counts as the
   king's one move and that rook's one move under rule B (each may still move once more on the same card).
6. **Swap and Revive** may not give check, and may not leave your own king in check.
7. **Shapeshift.** The piece moves as any other piece type for this one move, then is
   itself again.
   - It can never be used to castle.
   - Borrowed pawn movement is one square forward, a diagonal capture, or two squares
     forward only from the pawn starting rank of that army. It never allows en passant
     and never creates an en passant square.
   - Borrowed king movement is one square in any direction.
   - Promotion: see item 8.
8. **Promotion.** A real pawn that ends any move on the last rank always promotes,
   however it got there (normal move or Shapeshift). A non-pawn moving *as* a pawn
   onto the last rank doesn't promote.
9. **Draw Two / Draw Four** with a hand over 7. The penalised player draws all the cards.
   On later turns they still play exactly one card per turn and **don't draw** while their
   hand has 7 or more cards. Once it's below 7 after playing, they are topped up to 7.
   Precisely: at the end of every card, each player still in the game with fewer than 7 cards
   draws until they hold 7 (as far as the draw pile and the reshuffled discard pile allow),
   starting with the player who played, then clockwise. Nobody holds fewer than 7 cards otherwise.
10. **Skipped turns.** After a Draw Two or Draw Four, the player who played it takes the
    next turn.
11. **Freeze timing.** A freeze applies to the frozen army's next turn that is actually
    *played*. If that turn is skipped, the freeze carries to the following played turn.
12. **Shield timing.** It ends at the start of the shielding player's next turn,
    whether that is a played turn or a skipped one.
13. **Stalemate.** If the player to move isn't in check and their army has no legal
    ordinary chess move, the game is drawn. Holding only "useless" cards isn't a
    stalemate: such a player can always play a card (e.g. a 0).
14. **Multi-move stopping early.** A player may end a 1–5 card turn early with
    **Done moving** at any point, even before the first move. The exception is rule C: when
    in check, the first (escaping) move is required. If no legal move remains for any piece that still has a move left, the turn ends
    automatically.
15. **Resign.** Either player may resign at any time. The opponent wins.

## 6. Engine design

### State
- `board`: 64 squares, each empty or a piece `{id, type, army}`. Piece IDs are stable for
  the whole game; a revived piece gets a new ID.
- Chess bookkeeping: castling rights per army, en passant target square, captured pieces
  per army.
- `seats`: `{white: PlayerId, black: PlayerId}`. Reverse swaps them.
- `hands`: per player. `drawPile` and `discardPile`, each a list of cards `{id, kind, colour}`.
- `turn`: the current player, plus a phase:
  - `awaitingCard`
  - `resolving` (a card in progress: moves left, IDs of pieces already moved, whether
    it was played as a "1")
  - `over` (result and reason)
- `effects`: frozen `{pieceId, army, remainingPlayedTurns}`, shields `{pieceId, expiresAtStartOfTurnOf}`,
  and `pendingSkip` for a player.
- `rng`: a seeded generator so tests are reproducible.

### API
- `createGame(seed, players) → State`
- `apply(state, playerId, action) → {ok: true, state, events} | {ok: false, error}`.
  It never mutates its input.
- `viewFor(state, playerId) → PlayerView`. This hides the opponent's hand (a count only)
  and the draw pile order (a count only).
- `legalOptions(state, playerId)`. These are UI helpers: playable cards, legal moves for
  the current step, and legal targets.

### Actions
`playCard {cardId, asOne?}` · `move {from, to, promotion?}` · `swap {a, b}` ·
`target {pieceId}` (Freeze and Shield) · `shapeshift {pieceId, as, to, promotion?}` ·
`revive {capturedIndex, square, asQueen?}` · `doneMoving` · `resign`

### Turn flow
1. When a turn starts, expire shields and handle any skip. A skipped turn draws nothing:
   the penalty cards were already drawn when the card was played.
2. `playCard` validates the card against §5.3 and either resolves immediately or enters
   `resolving`.
3. After each move, the engine checks:
   - promotion
   - captures, which are added to the captured list
   - whether the opponent is now in check, which ends the card per rule A
4. When the card ends:
   - discard it
   - run the DRAW step (§5.9)
   - pass the turn to the next player, or back to the same player if a skip applies
   - evaluate checkmate or stalemate for the player now to move (§5.2, §5.13)

## 7. Server design

- An HTTP server serves the built web app and `POST /api/games`, which creates a game and
  returns `{gameId, seatToken}`.
- A WebSocket endpoint is used for everything else. Client messages:
  - `join {gameId, nickname, seatToken?}`
  - `action {action}`
  - `rematch`

  Server messages:
  - `state {view}`, sent to each player separately
  - `error {message}`
  - `presence {opponentConnected}`
- Game IDs are short random strings. Seat tokens are long random secrets and are never
  sent to the other player.
- Games live in an in-memory map. Games idle for more than 24 hours are removed.
- Every action is validated by `engine.apply`. Clients never send state, only intentions.

## 8. Error handling

- Illegal actions return a short human-readable error, shown as a toast. The client
  state is unchanged.
- The web app disables illegal options using `legalOptions`, so errors are rare.
- An unknown or expired game ID redirects to the home page with a short note.
- A full game shows "This game is full."
- When a socket drops, the client reconnects automatically with backoff and re-joins
  with its seat token.

## 9. Testing

- **Engine (Vitest):**
  - chess fundamentals: legal moves for every piece, castling, en passant, promotion,
    check, checkmate, stalemate
  - every card
  - rules A, B and C
  - every clarification in §5
  - the page-4 diagrams as test positions:
    - Swap rook and king
    - the frozen queen
    - a boxed-in bishop leaping like a knight
    - a shielded queen on an open file
    - Revive's legal and illegal squares, including the square that would give check
  - deck composition (114 cards) and the reshuffle when the draw pile is empty
- **Server (Vitest):** two simulated clients play a scripted game over real WebSockets.
  Tests also check that neither ever receives the other's hand or the draw-pile order, and
  cover reconnecting with a seat token and rejecting a third visitor.
- **Web (Playwright):** two browser contexts create and join a game, then play several
  cards, including a multi-move card and a Swap.

## 10. Deployment

- `npm run build` builds the engine, web and server. `npm start` serves everything on `PORT`.
- `render.yaml` describes one Node web service.
- The README explains how to connect the repository on Render.
