/** Read-only questions about a live game. Shared by the engine, twists and UI. */
import type { GameSettings, Gift, LivePlayer, LiveState, PublicLiveState } from "@/lib/types";

export class EngineError extends Error {}

export type EngineSettings = Pick<GameSettings, "maxStealsPerGift" | "finalSwap"> & { twists?: GameSettings["twists"] };

type AnyState = LiveState | PublicLiveState;

export const isLocked = (gift: Gift, settings: Pick<EngineSettings, "maxStealsPerGift">) =>
  gift.stealCount - (gift.lockOffset ?? 0) >= settings.maxStealsPerGift;

/** Steals left before a gift locks. */
export const stealsLeft = (gift: Gift, max: number) => Math.max(0, max - (gift.stealCount - (gift.lockOffset ?? 0)));

export const giftHeldBy = (state: Pick<AnyState, "gifts">, playerId: string) => state.gifts.find((g) => g.holder === playerId) ?? null;

/** Players whose gift is still in the pile. */
export function unopenedBringers(state: Pick<AnyState, "players" | "gifts">): LivePlayer[] {
  const opened = new Set(state.gifts.map((g) => g.broughtBy));
  return state.players.filter((p) => !opened.has(p.id));
}

export type StealBlock = "locked" | "noStealBack" | "own" | "frozen" | "mustOpen" | null;

/** Why `playerId` can't steal `gift` right now, or null if they can. */
export function stealBlock(state: AnyState, gift: Gift, playerId: string, settings: EngineSettings): StealBlock {
  if (gift.holder === playerId) return "own";
  if (isLocked(gift, settings)) return "locked";
  if (state.phase === "turns") {
    if ((state.stealLockTurns ?? 0) > 0) return "frozen";
    if (state.modifiers?.mustOpen) return "mustOpen";
    if (state.noStealBack?.giftId === gift.id && state.noStealBack.playerId === playerId) return "noStealBack";
  }
  return null;
}

export function stealableGifts(state: AnyState, playerId: string, settings: EngineSettings): Gift[] {
  return state.gifts.filter((g) => stealBlock(state, g, playerId, settings) === null);
}

/** Whether the current actor may open a gift (a "Heist" twist can forbid it). */
export function canOpen(state: AnyState, playerId: string, settings: EngineSettings): boolean {
  if (state.phase !== "turns" || giftHeldBy(state, playerId)) return false;
  if (state.modifiers?.mustSteal && stealableGifts(state, playerId, settings).length > 0) return false;
  return unopenedBringers(state).length > 0;
}

export function voteSummary(gift: Gift) {
  const votes = Object.values(gift.votes);
  const up = votes.filter((v) => v === "up").length;
  const down = votes.length - up;
  return { up, down, ruleBreaker: down > up };
}

export const playerName = (state: Pick<AnyState, "players">, id: string | null | undefined) =>
  state.players.find((p) => p.id === id)?.name ?? "Someone";

/** The circle of gift holders, in turn order (used for passing left/right). */
export function holdersInOrder(state: Pick<AnyState, "turnOrder" | "gifts">): string[] {
  return state.turnOrder.filter((id) => giftHeldBy(state, id));
}
