# IsaChess — Three-Player Mode and Opening Page — Design Spec

**Date:** 2026-10-15
**Status:** Design approved in conversation, awaiting written-spec review
**Builds on:** `2026-10-13-isachess-online-design.md` (the 2-player spec; everything there still applies to the 2-player mode)

## 1. Goal

The opening page offers two choices: **2-player** IsaChess (unchanged) and **3-player** IsaChess.
3-player keeps every existing card rule and agreed clarification. Only the board layout and the
rules that three players make necessary are new. It is played online like today: one person
creates a game, shares the link, and three people play, each on their own device.

### Out of scope
Four-player mode, a computer opponent, spectators, clocks, persistence across restarts (as in v1).

## 2. Sources for the 3-player rules

Rules researched from 3-chess.com ([rules](https://3-chess.com/rules)), the Yellow Mountain
Imports [how-to page](https://www.ymimports.com/pages/how-to-play-three-player-chess) and
[manual](https://ymimports.onsitesupport.io/yellowmountainimports/knowledge-base/article/three-player-chess-manual),
[Wikipedia](https://en.wikipedia.org/wiki/Three-player_chess) and [3 Man Chess](https://3manchess.com/rules/).
Where they differ, **the 3-chess.com checkmate rule was chosen** (the ymimports "first checkmate wins" ending is not used).
The rules pages were not directly readable from the build environment, so the geometry in §4 follows the
commonly published layout and should be checked against a real board during play-testing (see §9).

## 3. Rules for three players

**Setup.** Three armies: White, Red, Black, seated clockwise. Same 114-card deck (see the 2-player spec), 7 cards each.
White moves first; turns then go clockwise by *player*, skipping eliminated players.
Each army starts in its own area in the normal chess starting position.

**Unchanged.** Every card and every clarification of the 2-player spec §4–5.

**"The opponent".** Trade Hands (9), Draw Two, Draw Four and Switch Sides name an opponent. In 3-player
the player who plays the card **chooses which opponent** it affects. Freeze may target any opponent's piece.
Freeze and Shield timings count the turns of the army's controller.

**Skipped turns.** Draw Two / Draw Four make the chosen opponent skip their next turn; play passes to the next
non-eliminated player clockwise.

**Check.**
- No move or effect may leave your own king in check, from either opponent.
- Giving check to **either** opponent ends a 1–5 move card (rule A).
- Check from two opponents at once is still just check: the move must resolve both.
- Kings are never captured. Check only matters on the checked player's own turn.

**Elimination.** A player who is checkmated *when their own turn starts* (in check, and no legal ordinary chess
move, whatever is in their hand) is **eliminated**:
- their pieces stay on the board; they cannot move, but can be captured, and still block and give check;
- their hand goes to the discard pile;
- they are skipped in the turn order and cannot be targeted by cards.
Resigning is elimination with the same effects.

**Winning.** The last player with a king (not eliminated) wins.

**Stalemate.** With three players in, a stalemated player (not in check, no legal ordinary chess move) has their
turn skipped: no card, no draw; their turn returns when a move exists again. With two players left a stalemate
is a draw.

**Promotion.** A pawn promotes on the far edge of either opponent's area. **Revive** returns a piece to the
first two rows of the army's own area.

## 4. The board

A hexagon of 96 squares in six 4×4 zones. Each player owns two neighbouring zones (files a–d and e–h, ranks 1–4
from their own edge); the board is drawn with the viewer's army at the bottom.

- **Files** continue past the centre: a player's a–d files run into the opponent on their left, e–h into the
  opponent on their right (White's c-file continues as Red's f-file, down to Red's rank 1).
- **Ranks** stay inside a player's own area.
- **Diagonals** follow the same joins. The six squares at the centre (every player's d4 and e4) form the
  rosette, a ring of six around the centre point. A diagonal that reaches the centre **branches onto the other
  three rosette squares** (the ones that touch the centre only at its corner), and from each of those it carries
  on outward along that square's long diagonal. So a bishop or queen may continue along any of three branches,
  and a pawn on a rosette square can capture on all three.
- **Knights and kings** move by the same neighbour rules. A king's neighbours are its orthogonal and diagonal neighbours.
- **Pawns** move toward the centre and continue along the file into whichever opponent's area it leads to; they capture
  diagonally forward, double-step from their own rank 2, and en passant works as normal.

## 5. Engine design

- **Geometry module.** A `Geometry` describes a board: squares, per-square rays in every direction (sliding
  pieces, including the split at the rosette), knight jumps, king steps, pawn paths and captures, promotion
  squares, starting position and Revive squares. Two implementations: `classic` (8×8, behaviour identical to
  today) and `hex3` (96 squares). Move generation, attack and check detection read only from the geometry.
- **State.** `createGame(seed, players, variant)`; the state stores the variant. `Army` becomes `'w' | 'r' | 'b'`.
  Seats, castling rights and captured pieces are maps keyed by army. `players` is ordered clockwise; each has an
  `eliminated` flag.
- **Turn order.** `opponentOf` is replaced by `opponentsOf(state, player)` (opponents still in the game) and
  `nextPlayer` (clockwise, skipping eliminated players).
- **Targeted cards.** Trade Hands, Draw Two, Draw Four and Switch Sides take a `target` player; in 2-player it is
  filled in automatically, so existing clients and tests do not change.
- **Check.** Tested against every other army, including an eliminated army's pieces.
- **Turn start:** expire shields; handle any pending skip; if the player is checkmated, eliminate them and move on;
  if stalemated with three players in, skip them. The game ends when one player is left, or on stalemate with two left.
- **Views.** `PlayerView` gains `variant`, an `opponents` list (name, army, hand count, eliminated) and `inCheck` as
  a list of armies. The hidden-information rules are unchanged: a player sees only their own hand.

## 6. Server design

- `POST /api/games` takes `variant`. A room fills at 2 or 3 seats depending on the variant; the lobby shows who
  has joined ("2 of 3 joined") and the game starts when the last seat fills. Seat tokens, reconnection, the full
  message, chat and the 24-hour cleanup behave as today.
- Presence is reported per opponent. Rematch needs a vote from every player, and seats rotate one place so everyone
  moves first in turn.

## 7. Web design

- **Home page:** two buttons, **2-player game** and **3-player game**, each creating a game of that variant with the
  entered nickname. The card guide link stays.
- **`HexBoard`:** an SVG hexagon board rendering the 96 squares with your army at the bottom, using the same
  highlights, badges, shield/freeze marks, check marker and move animation as the 8×8 board.
- **Pieces:** a Red set made by recolouring the existing piece artwork.
- **Game screen:** an opponent list (name, card count, eliminated or disconnected); a "Which opponent?" picker for
  targeted cards; status line, event log and game-over panel updated for 3 players; card guide gains 3-player notes.

## 8. Testing

- **Engine (Vitest):** the existing 2-player suite stays green. New tests:
  - geometry: 96 squares; rays through the rosette in both branches; pawn paths and promotion; knight and king steps;
  - each rule in §3: chosen targets, elimination with pieces left as blockers, check from two armies, stalemate skip,
    two-left stalemate draw, last king wins, Revive squares.
- **Server (Vitest):** three simulated clients on the 3-player board; no player ever receives another's hand;
  reconnecting; a fourth visitor is rejected.
- **End-to-end (Playwright):** three browser windows create and join a 3-player game and play several cards;
  the existing 2-player test is untouched.

## 9. Assumptions to confirm

1. The three-way branching of diagonals at the rosette in §4 matches the board used by the rules author, and ranks do not wrap around the corners of the hexagon (a rook on a rank stops at the edge of its own area).
2. Eliminated players' pieces still give check and block, but cannot move.
3. A pawn's double step is from its own rank 2, and en passant is per normal chess against the army that just moved.
4. Rematch rotates seats one place rather than reshuffling arbitrarily.
