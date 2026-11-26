import type { ChallengeDef, Difficulty } from "@/lib/types";

/**
 * Gift challenges. Add your own here — see the README for the format.
 *
 * - `id` must be unique.
 * - `difficulty`: easy rules show up in every mode, normal rules in normal and chaos,
 *   chaos rules only in chaos.
 * - `text` may use {limit}, {half} and {quarter}, which are filled in from the price limit.
 * - `tags`/`conflicts` stop silly combinations in combo mode, e.g. a rule with
 *   conflicts: ["edible"] is never paired with a rule tagged "edible".
 *
 * Letter rules ("starts with P") are generated from LETTER_POOLS below, not listed here.
 */
export const CHALLENGES: ChallengeDef[] = [
  // ---------- Categories ----------
  { id: "cat-kitchen", type: "category", difficulty: "easy", text: "Something for the kitchen" },
  { id: "cat-cozy", type: "category", difficulty: "easy", text: "Something cozy" },
  { id: "cat-desk", type: "category", difficulty: "easy", text: "Something for a desk" },
  { id: "cat-selfcare", type: "category", difficulty: "easy", text: "A self-care treat" },
  { id: "cat-game", type: "category", difficulty: "easy", text: "A game or toy" },
  { id: "cat-winter", type: "category", difficulty: "easy", text: "Something for winter" },
  { id: "cat-gas-station", type: "category", difficulty: "normal", text: "Something you'd find at a gas station" },
  { id: "cat-lights-up", type: "category", difficulty: "normal", text: "Something that lights up", tags: ["electronic"], conflicts: ["edible"] },
  { id: "cat-90s", type: "category", difficulty: "normal", text: "Something that screams the 90s" },
  { id: "cat-pet", type: "category", difficulty: "normal", text: "Something for a pet (even if nobody has one)" },
  { id: "cat-beach", type: "category", difficulty: "normal", text: "Something for the beach — in December" },
  { id: "cat-car", type: "category", difficulty: "normal", text: "Something for a car" },
  { id: "cat-hardware", type: "category", difficulty: "chaos", text: "Something from a hardware store", conflicts: ["edible"] },
  { id: "cat-pirate", type: "category", difficulty: "chaos", text: "Something a pirate would treasure" },
  { id: "cat-grandma", type: "category", difficulty: "chaos", text: "Something a grandma would love — for a 25-year-old" },
  { id: "cat-useless", type: "category", difficulty: "chaos", text: "Something completely useless but beautiful" },
  { id: "cat-time-travel", type: "category", difficulty: "chaos", text: "Something a time traveller from 1850 would be baffled by", tags: ["electronic"], conflicts: ["edible"] },

  // ---------- Constraints ----------
  { id: "con-half-price", type: "constraint", difficulty: "easy", text: "Costs under {half}" },
  { id: "con-red-green", type: "constraint", difficulty: "easy", text: "Must be red or green" },
  { id: "con-edible", type: "constraint", difficulty: "easy", text: "Must be edible", tags: ["edible"], conflicts: ["electronic"] },
  { id: "con-daily", type: "constraint", difficulty: "easy", text: "Something you'd use every day" },
  { id: "con-soft", type: "constraint", difficulty: "easy", text: "Must be soft" },
  { id: "con-dollar-store", type: "constraint", difficulty: "normal", text: "Must be from a dollar store" },
  { id: "con-noise", type: "constraint", difficulty: "normal", text: "Must make noise" },
  { id: "con-pocket", type: "constraint", difficulty: "normal", text: "Must fit in a pocket" },
  { id: "con-new-store", type: "constraint", difficulty: "normal", text: "Bought at a store you've never shopped at" },
  { id: "con-handmade", type: "constraint", difficulty: "normal", text: "Handmade or personalised by you" },
  { id: "con-blue", type: "constraint", difficulty: "normal", text: "Must be blue" },
  { id: "con-quarter", type: "constraint", difficulty: "chaos", text: "Costs under {quarter} — total" },
  { id: "con-pun", type: "constraint", difficulty: "chaos", text: "Must come with a pun on a card" },
  { id: "con-set-of-3", type: "constraint", difficulty: "chaos", text: "Must come in a set of exactly 3" },
  { id: "con-animal", type: "constraint", difficulty: "chaos", text: "Must be shaped like an animal", conflicts: ["edible"] },
  { id: "con-weirdest", type: "constraint", difficulty: "chaos", text: "The weirdest thing in the store" },

  // ---------- Wrapping ----------
  { id: "wrap-newspaper", type: "wrapping", difficulty: "easy", text: "Wrapped in newspaper only" },
  { id: "wrap-drawing", type: "wrapping", difficulty: "easy", text: "Wrapping decorated with your own drawing" },
  { id: "wrap-big-bow", type: "wrapping", difficulty: "easy", text: "Topped with a bow that's far too big" },
  { id: "wrap-one-colour", type: "wrapping", difficulty: "easy", text: "Wrapped in one single colour" },
  { id: "wrap-disguise-shape", type: "wrapping", difficulty: "normal", text: "Disguised as a different shape" },
  { id: "wrap-badly", type: "wrapping", difficulty: "normal", text: "Wrapped as badly as possible" },
  { id: "wrap-reused", type: "wrapping", difficulty: "normal", text: "Packed in a box from a totally different product" },
  { id: "wrap-no-tape", type: "wrapping", difficulty: "normal", text: "No tape allowed" },
  { id: "wrap-layers", type: "wrapping", difficulty: "chaos", text: "Wrapped in at least 3 layers" },
  { id: "wrap-clothing", type: "wrapping", difficulty: "chaos", text: "Wrapped in an item of clothing" },
  { id: "wrap-foil", type: "wrapping", difficulty: "chaos", text: "Wrapped only in aluminium foil" },
  { id: "wrap-fake-label", type: "wrapping", difficulty: "chaos", text: "Labelled as a completely different gift" },
];

/**
 * Letters each mode may draw for letter rules, by position in the gift's name.
 * Easy mode never uses Q, X or Z, and sticks to letters lots of everyday items start/end with.
 */
export const LETTER_POOLS: Record<"start" | "end" | "contain", Record<Difficulty, string>> = {
  start: {
    easy: "BCDFGHLMPST",
    normal: "ABCDEFGHIKLMNOPRSTW",
    chaos: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  },
  end: {
    easy: "ESTRNDLY",
    normal: "ESTRNDLYKHAOP",
    chaos: "ABCDEFGHIKLMNOPRSTUXYZ",
  },
  contain: {
    easy: "AEIORSTLN",
    normal: "AEIORSTLNBCDGMPUKWY",
    chaos: "JKQVWXYZ",
  },
};
