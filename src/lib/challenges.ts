import { CHALLENGES, LETTER_POOLS } from "@/data/challenges";
import { pick, pickWeighted, shuffle, type Rng } from "@/lib/random";
import type { Challenge, ChallengeDef, ChallengeRule, ChallengeType, Difficulty, GameSettings } from "@/lib/types";

type GiftRuleType = Exclude<ChallengeType, "wrapping">;
const GIFT_RULE_TYPES: GiftRuleType[] = ["category", "letter", "constraint"];

/** How strongly each mode favours rules of each difficulty. 0 = never used. */
const DIFFICULTY_WEIGHTS: Record<Difficulty, Record<Difficulty, number>> = {
  easy: { easy: 1, normal: 0, chaos: 0 },
  normal: { easy: 1, normal: 2, chaos: 0 },
  chaos: { easy: 1, normal: 2, chaos: 4 },
};

/** How many rules each mode hands out. */
const MODE_SHAPE: Record<Difficulty, { giftRules: (rng: Rng) => number; wrappingChance: number }> = {
  easy: { giftRules: () => 1, wrappingChance: 0.25 },
  normal: { giftRules: (rng) => (rng() < 0.35 ? 2 : 1), wrappingChance: 0.4 },
  chaos: { giftRules: (rng) => (rng() < 0.3 ? 3 : 2), wrappingChance: 0.75 },
};

export function formatMoney(amount: number): string {
  const rounded = Math.max(1, Math.round(amount));
  return `$${rounded}`;
}

/** Fills {limit}, {half} and {quarter} from the price limit. */
export function fillText(text: string, priceLimit: number): string {
  return text
    .replaceAll("{limit}", formatMoney(priceLimit))
    .replaceAll("{half}", formatMoney(priceLimit / 2))
    .replaceAll("{quarter}", formatMoney(priceLimit / 4));
}

function defToRule(def: ChallengeDef, priceLimit: number): ChallengeRule {
  return { id: def.id, type: def.type, text: fillText(def.text, priceLimit), difficulty: def.difficulty };
}

const LETTER_PHRASES = {
  start: (l: string) => `Its name starts with "${l}"`,
  end: (l: string) => `Its name ends with "${l}"`,
  contain: (l: string) => `Its name contains the letter "${l}"`,
} as const;

/** Builds a letter rule using only the letters allowed for the mode. */
export function generateLetterRule(mode: Difficulty, rng: Rng): ChallengeRule {
  const weights = DIFFICULTY_WEIGHTS[mode];
  const level = pickWeighted<Difficulty>(["easy", "normal", "chaos"], (d) => weights[d], rng);
  const position = pick(["start", "end", "contain"] as const, rng);
  const letter = pick(LETTER_POOLS[position][level].split(""), rng);
  return { id: `letter-${position}-${letter}`, type: "letter", text: LETTER_PHRASES[position](letter), difficulty: level };
}

function conflicts(a: ChallengeDef, b: ChallengeDef): boolean {
  const hits = (x: ChallengeDef, y: ChallengeDef) => (x.conflicts ?? []).some((tag) => (y.tags ?? []).includes(tag));
  return hits(a, b) || hits(b, a);
}

/** Picks a hand-written rule of one type, avoiding conflicts and (if possible) ids already used. */
function pickDef(
  type: Exclude<ChallengeType, "letter">,
  mode: Difficulty,
  chosen: ChallengeDef[],
  avoidIds: ReadonlySet<string>,
  rng: Rng,
  pool: readonly ChallengeDef[],
): ChallengeDef | null {
  const weights = DIFFICULTY_WEIGHTS[mode];
  const allowed = pool.filter(
    (d) => d.type === type && weights[d.difficulty] > 0 && !chosen.some((c) => conflicts(c, d)),
  );
  if (allowed.length === 0) return null;
  const fresh = allowed.filter((d) => !avoidIds.has(d.id));
  return pickWeighted(fresh.length > 0 ? fresh : allowed, (d) => weights[d.difficulty], rng);
}

export interface GenerateOptions {
  settings: Pick<GameSettings, "difficulty" | "challengeTypes" | "priceLimit">;
  rng?: Rng;
  /** Rule ids to avoid if anything else is available (e.g. other players' rules). */
  avoidIds?: ReadonlySet<string>;
  /** Override the challenge list (tests, custom packs). */
  pool?: readonly ChallengeDef[];
}

export function enabledTypes(settings: Pick<GameSettings, "challengeTypes">): ChallengeType[] {
  return (Object.keys(settings.challengeTypes) as ChallengeType[]).filter((t) => settings.challengeTypes[t]);
}

/** Creates one player's secret challenge. Always returns at least one rule. */
export function generateChallenge({ settings, rng = Math.random, avoidIds = new Set(), pool = CHALLENGES }: GenerateOptions): Challenge {
  const mode = settings.difficulty;
  const on = settings.challengeTypes;
  if (enabledTypes(settings).length === 0) throw new Error("At least one challenge type must be enabled");

  const shape = MODE_SHAPE[mode];
  const giftTypes = GIFT_RULE_TYPES.filter((t) => on[t]);
  const wanted = Math.min(shape.giftRules(rng), giftTypes.length);

  const rules: ChallengeRule[] = [];
  const chosenDefs: ChallengeDef[] = [];

  // One rule per type, so combos read like "Kitchen item + starts with S".
  for (const type of shuffle(giftTypes, rng)) {
    if (rules.length >= wanted) break;
    if (type === "letter") {
      let rule = generateLetterRule(mode, rng);
      for (let i = 0; i < 5 && avoidIds.has(rule.id); i++) rule = generateLetterRule(mode, rng);
      rules.push(rule);
      continue;
    }
    const def = pickDef(type, mode, chosenDefs, avoidIds, rng, pool);
    if (def) {
      chosenDefs.push(def);
      rules.push(defToRule(def, settings.priceLimit));
    }
  }

  // Keep category/letter/constraint first, then wrapping.
  const order: Record<ChallengeType, number> = { category: 0, letter: 1, constraint: 2, wrapping: 3 };
  rules.sort((a, b) => order[a.type] - order[b.type]);

  if (on.wrapping && (rules.length === 0 || rng() < shape.wrappingChance)) {
    const def = pickDef("wrapping", mode, chosenDefs, avoidIds, rng, pool);
    if (def) rules.push(defToRule(def, settings.priceLimit));
  }

  if (rules.length === 0) throw new Error("No challenges available for these settings");
  return { rules };
}

export function challengeKey(c: Challenge): string {
  return c.rules.map((r) => r.id).sort().join("|");
}

/** A new challenge that shares as few rules as possible with the old one. */
export function rerollChallenge(current: Challenge, opts: GenerateOptions): Challenge {
  const avoid = new Set([...(opts.avoidIds ?? []), ...current.rules.map((r) => r.id)]);
  const rng = opts.rng ?? Math.random;
  let next = generateChallenge({ ...opts, rng, avoidIds: avoid });
  for (let i = 0; i < 20 && challengeKey(next) === challengeKey(current); i++) {
    next = generateChallenge({ ...opts, rng, avoidIds: avoid });
  }
  return next;
}
