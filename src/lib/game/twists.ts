/**
 * Game twists: random events that fire after a turn ends (someone opens a gift).
 * Each twist only fires when it would actually do something; otherwise another is picked.
 */
import { TWISTS } from "@/data/twists";
import { pick, shuffle, type Rng } from "@/lib/random";
import type { LiveState, TwistDef } from "@/lib/types";
import { holdersInOrder, isLocked, playerName, stealableGifts, type EngineSettings } from "./rules";

export const twistById = (id: string | undefined) => TWISTS.find((t) => t.id === id);

/** The player who just opened a gift (the last "open" event). */
function lastOpener(state: LiveState): string | null {
  for (let i = state.events.length - 1; i >= 0; i--) if (state.events[i].kind === "open") return state.events[i].by;
  return null;
}

/** Players holding a gift who have someone to swap with. */
function swapCandidates(state: LiveState, settings: EngineSettings): string[] {
  const probe = { ...state, phase: "bonusSwap" as const };
  return holdersInOrder(state).filter((id) => stealableGifts(probe, id, settings).length > 0);
}

/** Does this twist make sense right now? */
export function twistApplicable(state: LiveState, twist: TwistDef, settings: EngineSettings): boolean {
  const holders = holdersInOrder(state).length;
  const actor = state.actor;
  const e = twist.effect;
  switch (e.kind) {
    case "pass":
    case "swapRandom":
      return holders >= 2;
    case "shuffleAll":
      return holders >= 3;
    case "reverseOrder":
      return state.turnOrder.length - state.turnIndex >= 2;
    case "stealLock":
      return state.gifts.some((g) => !isLocked(g, settings)) && (state.stealLockTurns ?? 0) === 0;
    case "unlockAll":
      return state.gifts.some((g) => isLocked(g, settings));
    case "swapAny": {
      if (e.who === "previous") {
        const p = lastOpener(state);
        return p !== null && swapCandidates(state, settings).includes(p);
      }
      return swapCandidates(state, settings).length > 0;
    }
    case "mustOpen":
    case "blindPick":
      return actor !== null;
    case "mustSteal":
    case "freeSteal":
      return actor !== null && stealableGifts(state, actor, settings).length > 0;
    case "announce":
      return true;
  }
}

/** Rolls the dice after a turn. Returns the twist to apply, or null. */
export function rollTwist(state: LiveState, settings: EngineSettings, rng: Rng): TwistDef | null {
  const cfg = settings.twists;
  if (!cfg?.enabled || cfg.chance <= 0 || state.phase !== "turns") return null;
  if (rng() >= cfg.chance) return null;
  const options = TWISTS.filter((t) => cfg.enabledIds.includes(t.id) && twistApplicable(state, t, settings));
  return options.length > 0 ? pick(options, rng) : null;
}

/** Applies a twist's effect. Returns the new state and a note for the announcement. */
export function applyTwist(state: LiveState, twist: TwistDef, settings: EngineSettings, rng: Rng): { state: LiveState; note?: string } {
  const e = twist.effect;
  const moveGifts = (newHolder: (holder: string) => string) => state.gifts.map((g) => ({ ...g, holder: newHolder(g.holder) }));

  switch (e.kind) {
    case "pass": {
      const circle = holdersInOrder(state);
      const step = e.direction === "left" ? 1 : -1;
      const next = (h: string) => circle[(circle.indexOf(h) + step + circle.length) % circle.length];
      return { state: { ...state, gifts: moveGifts(next) } };
    }
    case "reverseOrder": {
      const played = state.turnOrder.slice(0, state.turnIndex);
      const rest = state.turnOrder.slice(state.turnIndex).reverse();
      const turnOrder = [...played, ...rest];
      // Only move the turn if the current actor is the turn owner (not mid steal-chain).
      const actor = state.actor === state.turnOrder[state.turnIndex] ? turnOrder[state.turnIndex] : state.actor;
      return { state: { ...state, turnOrder, actor }, note: `${playerName(state, actor)} is up next` };
    }
    case "stealLock":
      return { state: { ...state, stealLockTurns: e.turns } };
    case "unlockAll":
      return { state: { ...state, gifts: state.gifts.map((g) => (isLocked(g, settings) ? { ...g, lockOffset: g.stealCount } : g)) } };
    case "swapAny": {
      const who = e.who === "previous" ? lastOpener(state)! : pick(swapCandidates(state, settings), rng);
      return {
        state: { ...state, phase: "bonusSwap", resumeActor: state.actor, actor: who },
        note: `${playerName(state, who)} may swap with anyone`,
      };
    }
    case "swapRandom": {
      const [a, b] = shuffle(holdersInOrder(state), rng);
      const swap = (h: string) => (h === a ? b : h === b ? a : h);
      return { state: { ...state, gifts: moveGifts(swap) }, note: `${playerName(state, a)} ⇄ ${playerName(state, b)}` };
    }
    case "shuffleAll": {
      const holders = holdersInOrder(state);
      let shuffled = shuffle(holders, rng);
      // Try to make sure the shuffle actually changes something.
      for (let i = 0; i < 5 && shuffled.every((h, idx) => h === holders[idx]); i++) shuffled = shuffle(holders, rng);
      const map = new Map(holders.map((h, i) => [h, shuffled[i]]));
      return { state: { ...state, gifts: moveGifts((h) => map.get(h) ?? h) } };
    }
    case "mustOpen":
      return { state: { ...state, modifiers: { ...state.modifiers, mustOpen: true } } };
    case "mustSteal":
      return { state: { ...state, modifiers: { ...state.modifiers, mustSteal: true } } };
    case "freeSteal":
      return { state: { ...state, modifiers: { ...state.modifiers, freeSteal: true } } };
    case "blindPick":
      return { state: { ...state, modifiers: { ...state.modifiers, blindPick: true } } };
    case "announce":
      return { state };
  }
}
