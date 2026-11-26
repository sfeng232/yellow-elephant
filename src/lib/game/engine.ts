/**
 * The live game as pure functions: (state, action) → new state.
 * No I/O and no clocks; randomness only comes from the `rng` passed in, so it's easy
 * to test and safe to retry on the server.
 *
 * Rules:
 * - Turn order is shuffled at the start. On your turn you open a new gift or steal one.
 * - If your gift is stolen, you move next (open or steal). You can't steal straight back
 *   the gift just taken from you. The chain ends when someone opens a gift.
 * - A gift is locked once it's been stolen `maxStealsPerGift` times.
 * - After each turn, a twist may fire (see twists.ts).
 * - Optional finale: once every gift is open, the first player may swap with any
 *   unlocked gift, or keep theirs.
 */
import { shuffle, type Rng } from "@/lib/random";
import type { Challenge, GameEvent, Gift, LivePlayer, LiveState, PublicLiveState, Vote } from "@/lib/types";
import { canOpen, EngineError, giftHeldBy, playerName, stealBlock, unopenedBringers, type EngineSettings } from "./rules";
import { applyTwist, rollTwist } from "./twists";

export * from "./rules";

export type GameAction =
  | { type: "open"; by: string; broughtBy: string; label: string; challenge: Challenge; giftId: string }
  | { type: "steal"; by: string; giftId: string }
  | { type: "swap"; by: string; giftId: string | null }
  | { type: "vote"; by: string; giftId: string; vote: Vote | null }
  | { type: "creativeVote"; by: string; giftId: string | null }
  | { type: "end"; by: string }
  | { type: "undo"; by: string };

const MAX_EVENTS = 60;
const MAX_UNDO = 15;

export function createLiveState(players: LivePlayer[], rng: Rng): LiveState {
  if (players.length < 2) throw new EngineError("You need at least 2 players to start");
  const turnOrder = shuffle(players.map((p) => p.id), rng);
  return {
    players,
    turnOrder,
    turnIndex: 0,
    actor: turnOrder[0],
    phase: "turns",
    gifts: [],
    noStealBack: null,
    modifiers: {},
    stealLockTurns: 0,
    resumeActor: null,
    stats: { steals: {}, stolenFrom: {} },
    creativeVotes: {},
    seq: 1,
    events: [{ seq: 1, kind: "start", by: "", turn: 1 }],
    undo: [],
  };
}

function publicFields(state: LiveState): Omit<LiveState, "undo"> {
  const rest: Partial<LiveState> = { ...state };
  delete rest.undo;
  return rest as Omit<LiveState, "undo">;
}

export function toPublic(state: LiveState): PublicLiveState {
  return { ...publicFields(state), canUndo: state.undo.length > 0 };
}

// ---------- Helpers ----------

function pushUndo(state: LiveState): LiveState {
  return { ...state, undo: [...state.undo, structuredClone(publicFields(state))].slice(-MAX_UNDO) };
}

function withEvent(state: LiveState, event: Omit<GameEvent, "seq" | "turn">): LiveState {
  const seq = state.seq + 1;
  const events = [...state.events, { ...event, seq, turn: state.turnIndex + 1 }].slice(-MAX_EVENTS);
  return { ...state, seq, events };
}

function requireActor(state: LiveState, by: string, phases: LiveState["phase"][]) {
  if (!phases.includes(state.phase)) throw new EngineError("That move isn't allowed right now");
  if (state.actor !== by) throw new EngineError(`It's ${playerName(state, state.actor)}'s move, not yours`);
}

function recordSteal(state: LiveState, thief: string, victim: string): LiveState["stats"] {
  const stats = state.stats ?? { steals: {}, stolenFrom: {} };
  return {
    steals: { ...stats.steals, [thief]: (stats.steals[thief] ?? 0) + 1 },
    stolenFrom: { ...stats.stolenFrom, [victim]: (stats.stolenFrom[victim] ?? 0) + 1 },
  };
}

function endGame(state: LiveState): LiveState {
  return withEvent({ ...state, phase: "ended", actor: null, resumeActor: null, modifiers: {} }, { kind: "end", by: "" });
}

/** After someone opens a gift: the next numbered turn starts (maybe with a twist), or the finale. */
function advanceTurn(state: LiveState, settings: EngineSettings, rng: Rng): LiveState {
  let next: LiveState = {
    ...state,
    noStealBack: null,
    turnIndex: state.turnIndex + 1,
    stealLockTurns: Math.max(0, (state.stealLockTurns ?? 0) - 1),
  };

  if (next.gifts.length >= next.players.length) {
    // Every gift is open.
    next = { ...next, turnIndex: next.turnOrder.length - 1, modifiers: {}, stealLockTurns: 0 };
    const first = next.turnOrder[0];
    const finale = { ...next, phase: "finalSwap" as const, actor: first };
    const firstCanSwap = settings.finalSwap && next.gifts.some((g) => stealBlock(finale, g, first, settings) === null);
    return firstCanSwap ? finale : endGame(next);
  }

  // Normally the next player in order is empty-handed. Skip anyone who isn't
  // (twists can move gifts around), falling back to any empty-handed player.
  const emptyHanded = (id: string) => !giftHeldBy(next, id);
  let i = next.turnIndex;
  while (i < next.turnOrder.length && !emptyHanded(next.turnOrder[i])) i++;
  next =
    i < next.turnOrder.length
      ? { ...next, turnIndex: i, actor: next.turnOrder[i] }
      : { ...next, turnIndex: next.turnOrder.length - 1, actor: next.turnOrder.find(emptyHanded)! };

  const twist = rollTwist(next, settings, rng);
  if (!twist) return next;
  const { state: twisted, note } = applyTwist(next, twist, settings, rng);
  return withEvent(twisted, { kind: "twist", by: "", twistId: twist.id, note });
}

// ---------- Actions ----------

export function applyAction(state: LiveState, action: GameAction, settings: EngineSettings, rng: Rng = Math.random): LiveState {
  switch (action.type) {
    case "open": {
      requireActor(state, action.by, ["turns"]);
      if (giftHeldBy(state, action.by)) throw new EngineError("You already have a gift");
      if (!canOpen(state, action.by, settings)) throw new EngineError("Heist twist! You have to steal this time");
      if (!unopenedBringers(state).some((p) => p.id === action.broughtBy)) throw new EngineError("That person's gift has already been opened");
      const label = action.label.trim();
      if (!label) throw new EngineError("Say what the gift is");
      if (state.gifts.some((g) => g.id === action.giftId)) throw new EngineError("Duplicate gift id");
      const gift: Gift = {
        id: action.giftId,
        broughtBy: action.broughtBy,
        label,
        holder: action.by,
        stealCount: 0,
        lockOffset: 0,
        openedAtTurn: state.turnIndex + 1,
        challenge: action.challenge,
        votes: {},
      };
      const opened = withEvent({ ...pushUndo(state), gifts: [...state.gifts, gift], modifiers: {} }, { kind: "open", by: action.by, giftId: gift.id });
      return advanceTurn(opened, settings, rng);
    }

    case "steal": {
      requireActor(state, action.by, ["turns"]);
      if (giftHeldBy(state, action.by)) throw new EngineError("You already have a gift");
      const gift = state.gifts.find((g) => g.id === action.giftId);
      if (!gift) throw new EngineError("That gift doesn't exist");
      const block = stealBlock(state, gift, action.by, settings);
      if (block === "locked") throw new EngineError(`"${gift.label}" is locked: it's been stolen too many times`);
      if (block === "noStealBack") throw new EngineError("No stealing straight back! Pick something else");
      if (block === "frozen") throw new EngineError("Steal freeze! No stealing right now");
      if (block === "mustOpen") throw new EngineError("Fresh gifts only! You have to open one");
      if (block === "own") throw new EngineError("You already hold that gift");
      const victim = gift.holder;
      const free = state.modifiers?.freeSteal === true;
      const gifts = state.gifts.map((g) =>
        g.id === gift.id ? { ...g, holder: action.by, stealCount: g.stealCount + 1, lockOffset: (g.lockOffset ?? 0) + (free ? 1 : 0) } : g,
      );
      return withEvent(
        {
          ...pushUndo(state),
          gifts,
          actor: victim,
          noStealBack: { giftId: gift.id, playerId: victim },
          modifiers: {},
          stats: recordSteal(state, action.by, victim),
        },
        { kind: "steal", by: action.by, giftId: gift.id, from: victim },
      );
    }

    case "swap": {
      // Used for a twist's bonus swap and for the final swap.
      requireActor(state, action.by, ["bonusSwap", "finalSwap"]);
      const finishing = state.phase === "finalSwap";
      const resume = (s: LiveState): LiveState =>
        finishing ? endGame(s) : { ...s, phase: "turns", actor: state.resumeActor ?? null, resumeActor: null };

      const base = pushUndo(state);
      if (action.giftId === null) return resume(withEvent(base, { kind: "keep", by: action.by }));

      const target = state.gifts.find((g) => g.id === action.giftId);
      const mine = giftHeldBy(state, action.by);
      if (!target || !mine) throw new EngineError("That gift doesn't exist");
      const block = stealBlock(state, target, action.by, settings);
      if (block) throw new EngineError(block === "locked" ? `"${target.label}" is locked` : "You can't swap with that gift");
      const other = target.holder;
      const gifts = state.gifts.map((g) =>
        g.id === target.id ? { ...g, holder: action.by, stealCount: g.stealCount + 1 } : g.id === mine.id ? { ...g, holder: other } : g,
      );
      const swapped = withEvent({ ...base, gifts, stats: recordSteal(state, action.by, other) }, { kind: "swap", by: action.by, giftId: target.id, from: other });
      return resume(swapped);
    }

    case "vote": {
      const gift = state.gifts.find((g) => g.id === action.giftId);
      if (!gift) throw new EngineError("That gift doesn't exist");
      if (!state.players.some((p) => p.id === action.by)) throw new EngineError("Only players can vote");
      if (gift.broughtBy === action.by) throw new EngineError("You can't vote on your own gift 😉");
      const votes = { ...gift.votes };
      if (action.vote) votes[action.by] = action.vote;
      else delete votes[action.by];
      // Votes don't create undo snapshots and don't count as game events.
      return { ...state, gifts: state.gifts.map((g) => (g.id === gift.id ? { ...g, votes } : g)) };
    }

    case "creativeVote": {
      if (!state.players.some((p) => p.id === action.by)) throw new EngineError("Only players can vote");
      const creativeVotes = { ...state.creativeVotes };
      if (action.giftId === null) {
        delete creativeVotes[action.by];
      } else {
        const gift = state.gifts.find((g) => g.id === action.giftId);
        if (!gift) throw new EngineError("That gift doesn't exist");
        if (gift.broughtBy === action.by) throw new EngineError("Nice try! You can't vote for your own gift");
        creativeVotes[action.by] = gift.id;
      }
      return { ...state, creativeVotes };
    }

    case "end": {
      if (state.phase === "ended") return state;
      return withEvent({ ...pushUndo(state), phase: "ended", actor: null, resumeActor: null }, { kind: "end", by: action.by });
    }

    case "undo": {
      const previous = state.undo.at(-1);
      if (!previous) throw new EngineError("Nothing to undo");
      // Keep the latest votes for gifts that still exist after undoing.
      const latestVotes = new Map(state.gifts.map((g) => [g.id, g.votes]));
      const gifts = previous.gifts.map((g) => ({ ...g, votes: latestVotes.get(g.id) ?? g.votes }));
      const restored: LiveState = {
        ...previous,
        gifts,
        creativeVotes: state.creativeVotes,
        // seq and the event feed keep going so phones notice the change.
        seq: state.seq,
        events: state.events,
        undo: state.undo.slice(0, -1),
      };
      return withEvent(restored, { kind: "undo", by: action.by });
    }
  }
}
