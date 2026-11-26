# 🐘🎁 White Elephant

A mobile-first white elephant gift exchange with two layers of twists:

1. **Gift challenges** before the party. Every player gets a secret rule their gift has to follow ("Something for the kitchen", "Its name starts with P", "Wrapped in newspaper only"), and can re-roll it once.
2. **Game twists** during the party. Random events fire between turns ("Pass to the left!", "Steal freeze").

Built with Next.js 16, TypeScript, Tailwind CSS 4 and Supabase Realtime. There's no login: games are found by a 5-character join code and expire after 48 hours.

> **Status:** all three phases are done: challenges, the live game, twists, the TV screen and awards. See [PLAN.md](PLAN.md).

## How a game runs

1. **Before the party:** the host creates a game and shares the code or QR code. Everyone joins, reveals their secret challenge, and can re-roll it once.
2. **At the party:** the host taps **Start**, which shuffles the turn order. On your turn your phone says *Your move!*:
   - **Open a gift:** type what it is and pick who brought it. Everyone's phone shows that person's challenge, so the group can vote 👍 or 👎 on whether they followed it.
   - **Steal:** take an opened gift. The person you stole from moves next. They can't steal it straight back, and a gift locks after the steal limit.
3. **Twists:** after each turn there's a chance (set by the host) that a twist fires: "Pass to the left!", "Steal freeze", "Mystery pick"… Every phone and the TV show the twist card, and the app applies its effect.
4. **Finale:** with **final swap** on, the first player may swap with any unlocked gift once every gift is open.
5. **Awards:** the end screen hands out Most Stolen, Best Rule Follower, Most Creative Interpretation (everyone votes), Rule Breaker, Biggest Thief and Most Robbed.

**The host page doubles as a control panel.** The host can act for anyone who's stuck, undo a mis-tap, or end the game early.

**TV mode:** open `/screen/<CODE>` on a laptop plugged into the TV. There's a link to it on the host page. It shows the QR code while people join, then the turn, the gift board, and big animated reveals, twists and awards. It's view-only and never shows anyone's challenge before their gift is opened.

---

## Quick start (no setup needed)

```bash
npm install
npm run dev
```

Open http://localhost:3000. With no Supabase keys set, the app uses an **in-memory store**, so you can try everything straight away. Phones refresh every 2.5 seconds instead of updating instantly, and games disappear when the server restarts.

**Testing on real phones over Wi-Fi:** find your laptop's local IP address (`ipconfig` on Windows, look for "IPv4 Address"), then on your phone open `http://<that-ip>:3000`. The host screen's QR code uses whatever address you opened it from, so open the host page on the IP address too.

## Running the tests

```bash
npm test          # run once
npm run test:watch
npm run typecheck
npm run lint
```

The tests live next to the code (`src/**/*.test.ts`):
- `src/lib/challenges.test.ts`: the challenge generator (fair letters, difficulty rules, combos, conflicts, re-rolls, settings validation)
- `src/lib/game/engine.test.ts`: turns and steals (turn order, steal chains, no steal-backs, locks, final swap, votes, undo, and 50 random full games)
- `src/lib/game/twists.test.ts`: every twist's effect, twist chance and filtering, awards, and 150 random full games with twists

---

## Setting up Supabase (for real-time sync)

1. Create a free project at [supabase.com](https://supabase.com).
2. In the dashboard, open **SQL Editor → New query**, paste the contents of [`supabase/schema.sql`](supabase/schema.sql), and click **Run**.
3. *(Optional, recommended)* To have expired games deleted automatically, go to **Database → Extensions**, enable **pg_cron**, then run `schema.sql` again. It schedules an hourly cleanup. Without this step the app still hides expired games; they just stay in the database.
4. Copy `.env.example` to `.env.local` and fill in the values from **Project Settings → API Keys**:
   - `NEXT_PUBLIC_SUPABASE_URL`: the project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: the **anon** or **publishable** key (safe for browsers)
   - `SUPABASE_SERVICE_ROLE_KEY`: the **service_role** or **secret** key (**server only**, never share it)
5. Restart `npm run dev`. Phones now update instantly.

### How sync and secrecy work

- Phones **never talk to the database directly.** Every read and write goes through the Next.js API routes in `src/app/api`, which use the service-role key.
- Both tables have row-level security turned on with **no policies**, so the public key can't read anything. That's what keeps challenges secret: a player's API response only ever includes *their own* challenge.
- After every change, the server sends a tiny "changed" ping over **Supabase Realtime Broadcast** (channel `game-<CODE>`). Phones that hear it re-fetch their own view. They also poll every 15 seconds and refresh when you switch back to the tab, so a missed ping is never a problem.
- Each player's identity is a random token saved in their browser's `localStorage`, and only its SHA-256 hash is stored. Clearing browser data or switching browsers means rejoining under a new name.

**Why Supabase over Firebase?** Both work. Supabase gives you real tables, which suit a game state that needs "only update if nobody else did" checks, and makes the 48-hour cleanup one line of SQL. Firebase is a bit quicker to start with and handles offline better, but its security rules for "you can only see your own challenge" are fiddlier, and deleting old data needs a Cloud Function.

---

## Deploying to Vercel

1. Push this folder to a GitHub repository.
2. In [Vercel](https://vercel.com), click **Add New → Project** and import the repository. The defaults are correct for Next.js.
3. Under **Environment Variables**, add the three variables from `.env.local`.
4. Click **Deploy**. Share the `*.vercel.app` URL, or just the QR code on the host screen.

> Without the Supabase variables, the deployed app falls back to the in-memory store, which **doesn't work on Vercel** because each request can hit a different server. Always set them for deploys.

---

## Adding your own challenges

Challenges are plain TypeScript in [`src/data/challenges.ts`](src/data/challenges.ts). Add an entry to the `CHALLENGES` array:

```ts
{ id: "cat-camping", type: "category", difficulty: "normal", text: "Something for a camping trip" },
```

| Field | Values | Notes |
| --- | --- | --- |
| `id` | any unique string | A test checks that ids are unique. |
| `type` | `"category"`, `"constraint"`, `"wrapping"` | Letter rules are generated (see below). |
| `difficulty` | `"easy"`, `"normal"`, `"chaos"` | Easy rules appear in every mode, normal rules in normal and chaos, chaos rules only in chaos. |
| `text` | string | Can include `{limit}`, `{half}` or `{quarter}`, which are filled in from the game's price limit, e.g. `"Costs under {half}"` becomes "Costs under $15" with a $30 limit. |
| `tags` | optional string[] | Describes the rule, e.g. `["edible"]`. |
| `conflicts` | optional string[] | Never combine with rules carrying these tags. For example, "Something that lights up" has `conflicts: ["edible"]`, so it's never paired with "Must be edible". |

**How many rules each mode hands out:**

| Mode | Gift rules | Extra wrapping rule | Rule pool |
| --- | --- | --- | --- |
| Easy | 1 | 25% chance | easy only |
| Normal | 1, sometimes 2 (35%) | 40% chance | easy + normal, normal favoured |
| Chaos | 2, sometimes 3 (30%) | 75% chance | everything, chaos favoured |

Each challenge has at most one rule of each type, so a combo reads like "Something for the kitchen + its name starts with S". The generator also tries not to repeat rules other players in the same game already have.

### Letter rules

Letter rules ("starts with", "ends with", "contains") draw from `LETTER_POOLS` in the same file. Each mode has its own letter list for each position, so easy mode only uses fair letters: **no Q, X or Z** (a test enforces this). Chaos mode's "contains" pool is deliberately all hard letters (J, K, Q, V, W, X, Y, Z). Edit the strings to make letters easier or harder.

## Adding your own game twists

Twists live in [`src/data/twists.ts`](src/data/twists.ts). The easiest custom twist uses `effect: { kind: "announce" }`. The app shows the card and the group plays it out in real life, with no code needed:

```ts
{ id: "carol", emoji: "🎶", difficulty: "easy", title: "Carol time",
  description: "The next player must sing a line of a holiday song before their turn.",
  effect: { kind: "announce" } },
```

You can also reuse any built-in effect with your own wording:

| `effect` | What the app does |
| --- | --- |
| `{ kind: "pass", direction: "left" \| "right" }` | Every gift moves to the next/previous holder in turn order |
| `{ kind: "reverseOrder" }` | The remaining turn order flips |
| `{ kind: "stealLock", turns: N }` | No steals for the next N turns |
| `{ kind: "unlockAll" }` | Locked gifts can be stolen again |
| `{ kind: "swapAny", who: "previous" \| "random" }` | The last opener, or a random holder, may swap with anyone |
| `{ kind: "swapRandom" }` | Two random holders swap |
| `{ kind: "shuffleAll" }` | All opened gifts are shuffled between holders |
| `{ kind: "mustOpen" }` / `{ kind: "mustSteal" }` | The next move must be an open / a steal |
| `{ kind: "freeSteal" }` | A steal on the next move doesn't count toward the lock |
| `{ kind: "blindPick" }` | The next player picks from shuffled face-down cards |

Twists only fire when they'd actually do something, so "pass left" never fires with just one gift out. Hosts can switch individual twists on or off when they create a game. To invent a brand-new effect, add a `kind` to `TwistEffect` in `src/lib/types.ts`, then handle it in `twistApplicable` and `applyTwist` in `src/lib/game/twists.ts`. TypeScript will point out anything you've missed.

---

## Project layout

```
src/
  app/                    Pages and API routes (Next.js App Router)
    api/games/...         Create, view, join, re-roll, remove player, start, action
    host/new, host/[code] Host setup, lobby, and live host controls
    join, play/[code]     Player join, secret challenge, live game
    screen/[code]         Big-screen TV view
  components/             UI pieces (flip card, buttons, snow)
    live/                 Live game board, turn controls, reveal and steal overlays
  data/                   ✏️ challenges.ts and twists.ts — edit these!
  lib/
    challenges.ts         The challenge generator (pure, tested)
    game/engine.ts        Turn and steal actions (pure, tested)
    game/rules.ts         Read-only rule checks shared with the UI
    game/twists.ts        Twist rolling and effects
    game/awards.ts        End-of-game awards
    settings.ts           Defaults and validation for host settings
    server/               Server-only: storage, tokens, realtime pings
    client/               Browser-only: API calls, session, live sync hook
supabase/schema.sql       Database setup
```
