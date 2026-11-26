import type { TwistDef } from "@/lib/types";

/**
 * Game twists that can fire between turns (used from Phase 3).
 * `effect.kind` decides what the game engine does; "announce" twists change nothing
 * in the app — the group just plays them out. Add your own with kind "announce"
 * if you don't want to write engine code.
 */
export const TWISTS: TwistDef[] = [
  // ---------- Easy ----------
  { id: "pass-left", emoji: "⬅️", difficulty: "easy", title: "Pass to the left!", description: "Everyone holding a gift passes it to the player on their left.", effect: { kind: "pass", direction: "left" } },
  { id: "pass-right", emoji: "➡️", difficulty: "easy", title: "Pass to the right!", description: "Everyone holding a gift passes it to the player on their right.", effect: { kind: "pass", direction: "right" } },
  { id: "must-open", emoji: "🎁", difficulty: "easy", title: "Fresh gifts only", description: "The next player must open a new gift — no stealing.", effect: { kind: "mustOpen" } },
  { id: "unlock-all", emoji: "🔓", difficulty: "easy", title: "Amnesty", description: "Every locked gift is unlocked and can be stolen again.", effect: { kind: "unlockAll" } },
  { id: "show-and-tell", emoji: "🎤", difficulty: "easy", title: "Show and tell", description: "The last person to open a gift gives a 20-second sales pitch for it.", effect: { kind: "announce" } },

  // ---------- Normal ----------
  { id: "reverse", emoji: "🔁", difficulty: "normal", title: "Reverse!", description: "The turn order flips direction.", effect: { kind: "reverseOrder" } },
  { id: "steal-lock-2", emoji: "🔒", difficulty: "normal", title: "Steal freeze", description: "Steals are locked for the next 2 turns.", effect: { kind: "stealLock", turns: 2 } },
  { id: "prev-swap", emoji: "🔄", difficulty: "normal", title: "Second thoughts", description: "The player who just went may swap gifts with anyone.", effect: { kind: "swapAny", who: "previous" } },
  { id: "blind-pick", emoji: "🙈", difficulty: "normal", title: "Mystery pick", description: "The next player picks blind from a shuffled list of every gift.", effect: { kind: "blindPick" } },
  { id: "free-steal", emoji: "🎟️", difficulty: "normal", title: "Free steal", description: "The next steal doesn't count toward that gift's steal limit.", effect: { kind: "freeSteal" } },
  { id: "rule-confession", emoji: "🕵️", difficulty: "normal", title: "Confession time", description: "Anyone who bent their gift rule must admit it now — or forever hold their peace.", effect: { kind: "announce" } },

  // ---------- Chaos ----------
  { id: "swap-random", emoji: "🎲", difficulty: "chaos", title: "Random swap", description: "Two random players swap their gifts.", effect: { kind: "swapRandom" } },
  { id: "must-steal", emoji: "🦹", difficulty: "chaos", title: "Heist", description: "The next player must steal if any gift can be stolen.", effect: { kind: "mustSteal" } },
  { id: "next-swap", emoji: "🌀", difficulty: "chaos", title: "Wild card", description: "The next player may swap with anyone instead of taking a normal turn.", effect: { kind: "swapAny", who: "next" } },
  { id: "shuffle-all", emoji: "🌪️", difficulty: "chaos", title: "Blizzard", description: "Every opened gift is shuffled to a random holder.", effect: { kind: "shuffleAll" } },
  { id: "steal-lock-3", emoji: "🧊", difficulty: "chaos", title: "Deep freeze", description: "Steals are locked for the next 3 turns.", effect: { kind: "stealLock", turns: 3 } },
  { id: "dance-off", emoji: "💃", difficulty: "chaos", title: "Dance-off", description: "The two most recent openers dance for 15 seconds. The group picks a winner, who may swap with the loser.", effect: { kind: "announce" } },
];
