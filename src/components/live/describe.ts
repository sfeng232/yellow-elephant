import { playerName } from "@/lib/game/engine";
import type { GameEvent, PublicLiveState } from "@/lib/types";

export function giftLabel(state: PublicLiveState, giftId?: string) {
  return state.gifts.find((g) => g.id === giftId)?.label ?? "a gift";
}

/** One-line description of an event for feeds and toasts. */
export function describeEvent(state: PublicLiveState, e: GameEvent): { emoji: string; text: string } {
  const who = playerName(state, e.by);
  switch (e.kind) {
    case "start":
      return { emoji: "🎉", text: "The exchange has begun!" };
    case "open":
      return { emoji: "🎁", text: `${who} opened “${giftLabel(state, e.giftId)}”` };
    case "steal":
      return { emoji: "🦹", text: `${who} stole “${giftLabel(state, e.giftId)}” from ${playerName(state, e.from)}!` };
    case "swap":
      return { emoji: "🔄", text: `${who} swapped for “${giftLabel(state, e.giftId)}” with ${playerName(state, e.from)}` };
    case "keep":
      return { emoji: "🤝", text: `${who} kept their gift` };
    case "undo":
      return { emoji: "↩️", text: "The host undid the last move" };
    case "end":
      return { emoji: "🏁", text: "That's a wrap!" };
  }
}
