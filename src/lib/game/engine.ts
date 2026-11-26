/**
 * The live game as pure functions: (state, action) → new state.
 * No I/O, no clocks, no randomness except through the `rng` passed in, so it's
 * easy to test and safe to retry on the server.
 *
 * Rules:
 * - Turn order is shuffled at the start. On your turn you open a new gift or steal one.
 * - If your gift is stolen, you act next (open or steal). You can't steal straight back
 *   the gift that was just taken from you. The chain ends when someone opens a gift.
 * - A gift is locked once it's been stolen `maxStealsPerGift` times.
 * - Optional finale: once every gift is open, the first player may swap with any
 *   unlocked gift, or keep theirs.
 */
import { shuffle, type Rng } from "@/lib/random";
import type { Challenge, GameEvent, GameSettings, Gift, LivePlayer, LiveState, PublicLiveState, Vote } from "@/lib/types";

export class EngineError extends Error {}

type EngineSettings = Pick<GameSettings, "maxStealsPerGift" | "finalSwap">;

export type GameAction =
  | { type: "open"; by: string; broughtBy: string; label: string; challenge: Challenge; giftId: string }
  | { type: "steal"; by: string; giftId: string }
  | { type: "finalSwap"; by: string; giftId: string | null }
  | { type: "vote"; by: string; giftId: string; vote: Vote | null }
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
    seq: 1,
    events: [{ seq: 1, kind: "start", by: "", turn: 1 }],
    undo: [],
  };
}

// ---------- Queries ----------

export const isLocked = (gift: Gift, settings: EngineSettings) => gift.stealCount >= settings.maxStealsPerGift;

export const giftHeldBy = (state: Pick<LiveState, "gifts">, playerId: string) => state.gifts.find((g) => g.holder === playerId) ?? null;

/** Players whose gift is still in the pile. */
export function unopenedBringers(state: Pick<LiveState, "players" | "gifts">): LivePlayer[] {
  const opened = new Set(state.gifts.map((g) => g.broughtBy));
  return state.players.filter((p) => !opened.has(p.id));
}

export type StealBlock = "locked" | "noStealBack" | "own" | null;

/** Why `playerId` can't steal `gift` right now, or null if they can. */
export function stealBlock(state: Pick<LiveState, "noStealBack">, gift: Gift, playerId: string, settings: EngineSettings): StealBlock {
  if (gift.holder === playerId) return "own";
  if (isLocked(gift, settings)) return "locked";
  if (state.noStealBack?.giftId === gift.id && state.noStealBack.playerId === playerId) return "noStealBack";
  return null;
}

export function stealableGifts(state: Pick<LiveState, "gifts" | "noStealBack">, playerId: string, settings: EngineSettings): Gift[] {
  return state.gifts.filter((g) => stealBlock(state, g, playerId, settings) === null);
}

export function voteSummary(gift: Gift) {
  const votes = Object.values(gift.votes);
  const up = votes.filter((v) => v === "up").length;
  const down = votes.length - up;
  return { up, down, ruleBreaker: down > up };
}

export const playerName = (state: Pick<LiveState, "players">, id: string | null | undefined) =>
  state.players.find((p) => p.id === id)?.name ?? "Someone";

export function toPublic(state: LiveState): PublicLiveState {
  return { ...toPublicFields(state), canUndo: state.undo.length > 0 };
}

// ---------- Actions ----------

function snapshot(state: LiveState): Omit<LiveState, "undo"> {
  return structuredClone(toPublicFields(state));
}

function toPublicFields(state: LiveState): Omit<LiveState, "undo"> {
  const rest: Partial<LiveState> = { ...state };
  delete rest.undo;
  return rest as Omit<LiveState, "undo">;
}

function withEvent(state: LiveState, event: Omit<GameEvent, "seq" | "turn">): LiveState {
  const seq = state.seq + 1;
  const events = [...state.events, { ...event, seq, turn: state.turnIndex + 1 }].slice(-MAX_EVENTS);
  return { ...state, seq, events };
}

function requireActor(state: LiveState, by: string, phase: LiveState["phase"]) {
  if (state.phase !== phase) throw new EngineError(phase === "finalSwap" ? "It's not time for the final swap" : "That move isn't allowed right now");
  if (state.actor !== by) throw new EngineError(`It's ${playerName(state, state.actor)}'s move, not yours`);
}

/** After someone opens a gift, the next numbered turn starts (or the finale). */
function advanceTurn(state: LiveState, settings: EngineSettings): LiveState {
  const next = { ...state, noStealBack: null, turnIndex: state.turnIndex + 1 };
  if (next.gifts.length < next.players.length) {
    // Normally the next player in order is empty-handed. Skip anyone who isn't
    // (possible once twists move gifts around), falling back to any empty-handed player.
    const emptyHanded = (id: string) => !giftHeldBy(next, id);
    let i = next.turnIndex;
    while (i < next.turnOrder.length && !emptyHanded(next.turnOrder[i])) i++;
    if (i < next.turnOrder.length) return { ...next, turnIndex: i, actor: next.turnOrder[i] };
    const anyone = next.turnOrder.find(emptyHanded)!;
    return { ...next, turnIndex: next.turnOrder.length - 1, actor: anyone };
  }
  // Every gift is open.
  const first = next.turnOrder[0];
  const firstCanSwap = settings.finalSwap && next.gifts.some((g) => stealBlock(next, g, first, settings) === null);
  if (firstCanSwap) return { ...next, turnIndex: next.turnOrder.length - 1, phase: "finalSwap", actor: first };
  return withEvent({ ...next, turnIndex: next.turnOrder.length - 1, phase: "ended", actor: null }, { kind: "end", by: "" });
}

export function applyAction(state: LiveState, action: GameAction, settings: EngineSettings): LiveState {
  switch (action.type) {
    case "open": {
      requireActor(state, action.by, "turns");
      if (giftHeldBy(state, action.by)) throw new EngineError("You already have a gift");
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
        openedAtTurn: state.turnIndex + 1,
        challenge: action.challenge,
        votes: {},
      };
      const opened = withEvent({ ...pushUndo(state), gifts: [...state.gifts, gift] }, { kind: "open", by: action.by, giftId: gift.id });
      return advanceTurn(opened, settings);
    }

    case "steal": {
      requireActor(state, action.by, "turns");
      if (giftHeldBy(state, action.by)) throw new EngineError("You already have a gift");
      const gift = state.gifts.find((g) => g.id === action.giftId);
      if (!gift) throw new EngineError("That gift doesn't exist");
      const block = stealBlock(state, gift, action.by, settings);
      if (block === "locked") throw new EngineError(`"${gift.label}" is locked: it's been stolen ${settings.maxStealsPerGift} times`);
      if (block === "noStealBack") throw new EngineError("No stealing straight back! Pick something else");
      if (block === "own") throw new EngineError("You already hold that gift");
      const victim = gift.holder;
      const gifts = state.gifts.map((g) => (g.id === gift.id ? { ...g, holder: action.by, stealCount: g.stealCount + 1 } : g));
      return withEvent(
        { ...pushUndo(state), gifts, actor: victim, noStealBack: { giftId: gift.id, playerId: victim } },
        { kind: "steal", by: action.by, giftId: gift.id, from: victim },
      );
    }

    case "finalSwap": {
      requireActor(state, action.by, "finalSwap");
      const base = pushUndo(state);
      if (action.giftId === null) {
        return withEvent({ ...base, phase: "ended", actor: null }, { kind: "keep", by: action.by });
      }
      const target = state.gifts.find((g) => g.id === action.giftId);
      const mine = giftHeldBy(state, action.by);
      if (!target || !mine) throw new EngineError("That gift doesn't exist");
      const block = stealBlock(state, target, action.by, settings);
      if (block) throw new EngineError(block === "locked" ? `"${target.label}" is locked` : "You can't swap with that gift");
      const other = target.holder;
      const gifts = state.gifts.map((g) =>
        g.id === target.id ? { ...g, holder: action.by, stealCount: g.stealCount + 1 } : g.id === mine.id ? { ...g, holder: other } : g,
      );
      const swapped = withEvent({ ...base, gifts }, { kind: "swap", by: action.by, giftId: target.id, from: other });
      return withEvent({ ...swapped, phase: "ended", actor: null }, { kind: "end", by: "" });
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

    case "end": {
      if (state.phase === "ended") return state;
      return withEvent({ ...pushUndo(state), phase: "ended", actor: null }, { kind: "end", by: action.by });
    }

    case "undo": {
      const previous = state.undo.at(-1);
      if (!previous) throw new EngineError("Nothing to undo");
      // Keep the latest votes for gifts that still exist after undoing.
      const latestVotes = new Map(state.gifts.map((g) => [g.id, g.votes]));
      const gifts = previous.gifts.map((g) => ({ ...g, votes: latestVotes.get(g.id) ?? g.votes }));
      // seq keeps counting up so phones notice the change.
      const restored: LiveState = { ...previous, gifts, seq: state.seq, events: state.events, undo: state.undo.slice(0, -1) };
      return withEvent(restored, { kind: "undo", by: action.by });
    }
  }
}

function pushUndo(state: LiveState): LiveState {
  return { ...state, undo: [...state.undo, snapshot(state)].slice(-MAX_UNDO) };
}
