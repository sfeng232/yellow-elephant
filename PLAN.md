# Build plan

## Decisions

| Question | Decision |
| --- | --- |
| Real-time backend | Supabase, used as Postgres plus Realtime Broadcast pings. An in-memory fallback for local dev. |
| Who acts during the game | Each player on their own phone. The host can act for anyone who is stuck. |
| Gift info | Whoever opens a gift types a short label ("Pickle-shaped night light"). |
| Hosting | Vercel |
| Identity | No login. A random token per player is kept in `localStorage`, and only its hash is stored. |

**Architecture:** the server is the single source of truth. Phones call API routes, the server applies the change and bumps a `version`, then broadcasts a "changed" ping. Phones re-fetch their own personalised view. Game logic is written as **pure functions** (state + action → new state) so it can be unit tested without a database. Writes use optimistic concurrency (`update … where version = n`), so two people tapping "steal" at the same moment can't corrupt the game.

## Data model

### `games`
| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | |
| code | text, unique | 5 characters, no vowels or look-alikes (e.g. `GLTTQ`) |
| host_token_hash | text | SHA-256 of the host's secret token |
| settings | jsonb | `GameSettings`: price limit, difficulty, challenge types, twists (on, chance, ids), steal limit |
| status | text | `lobby` → `live` → `ended` |
| state | jsonb | Live game state (Phase 2), see below |
| version | int | Bumped on every change, used for concurrency and sync |
| created_at / expires_at | timestamptz | expires_at = created_at + 48h |

### `players`
| Column | Type | Notes |
| --- | --- | --- |
| id | uuid | |
| game_id | uuid → games, cascade delete | |
| name | text | Unique per game (case-insensitive) |
| token_hash | text | |
| challenge | jsonb | `{ rules: [{ id, type, text, difficulty }] }`, secret until the gift is opened |
| rerolls_left | int | Starts at 1 |
| is_host | bool | |
| joined_at | timestamptz | |

### Live state (`games.state`, Phase 2–3)
```ts
{
  turnOrder: playerId[];          // shuffled at start
  turnIndex: number;
  direction: 1 | -1;              // "Reverse!" twist
  gifts: {                        // one per player, created as each is opened
    id; broughtBy: playerId; label: string; holder: playerId;
    stealCount: number; openedAtTurn: number;
    challenge: Challenge;         // copied in at open time, so it's public from then on
    votes: Record<playerId, "up" | "down">;
  }[];
  stolenFromThisTurn: playerId | null;   // whose turn it passes to after a steal
  noStealBack: { giftId, playerId } | null; // classic "no immediate steal-back" rule
  stealLockTurns: number;          // "Steal freeze"
  pendingTwist: { twistId, firedAtTurn } | null;
  modifiers: { mustOpen?; mustSteal?; freeSteal?; blindPick? };
  log: { at, kind, text }[];       // feed for the big screen and the end awards
}
```

## Screens

| Route | Who | Phase | Purpose |
| --- | --- | --- | --- |
| `/` | everyone | 1 | Enter a join code, or host a new game |
| `/host/new` | host | 1 | Price limit, difficulty, challenge types, twists and chance, steal limit, "I'm playing too" |
| `/host/[code]` | host | 1–2 | Big join code, QR code, share link, player list (remove), rules summary, **Start** |
| `/join` | player | 1 | Code + name |
| `/play/[code]` | player | 1–3 | Secret challenge flip card with one re-roll. Live game: whose turn, open/steal, gift list, voting |
| `/screen/[code]` | TV/laptop | 3 | Big-screen board: current turn, gift grid, twist announcements, reveal animations |
| `/play/[code]` (ended) and `/screen/[code]` (ended) | all | 3 | Final ownership and awards |

## Phases

### ✅ Phase 1: Challenge generator
- Host creates a game with settings and gets a join code, QR code and share link
- Players join with code + name and get a secret challenge (flip-card reveal), with one re-roll
- Host lobby updates live as players join or re-roll, and the host can remove players
- 44 seed challenges, 17 seed twists, and fair letter pools (no Q/X/Z on easy or normal)
- Generator tests, Supabase schema, README

### ✅ Phase 2: Live game (turns and steals)
- Host presses **Start**: the turn order is shuffled, challenges lock, and joining closes
- Turn banner ("Your move!" or "Ben's move"), with big **Open a gift** and **Steal** buttons
- Open: type what it is and pick who brought it. The challenge reveal pops up for everyone with 👍/👎 voting, and a 🚨 **Rule breaker** badge appears when 👎 outnumbers 👍. The bringer can't vote on their own gift
- Steal: pick from the open gifts. A gift locks after N steals, there's no immediate steal-back, and the victim moves next
- Optional **final swap**: once every gift is open, the first player may swap with any unlocked gift
- Gift board with holders, steal meters, each gift's challenge and votes. Turn-order strip and an event feed
- Host page: act for whoever's move it is, **Undo** last move (votes survive), **End game**
- A pure `applyAction(state, action)` engine in `src/lib/game/engine.ts` with 24 tests, including 50 random full games. Saves use optimistic concurrency, so double taps and simultaneous steals can't corrupt the game

### Phase 3: Twists, big screen, awards
- After each turn, a twist fires at the configured chance (from the enabled list) and its effect is applied by the engine
- `/screen/[code]`: TV layout with an animated twist card ("🔁 REVERSE!"), steal swoosh and gift board
- End screen: final ownership, plus **Most Stolen**, **Best Rule Follower** (most 👍), **Most Creative Interpretation** (a separate vote), **Rule Breaker**, and **Biggest Thief**
- Twist engine tests
