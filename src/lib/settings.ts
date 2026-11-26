import { TWISTS } from "@/data/twists";
import { CHALLENGE_TYPES, type Difficulty, type GameSettings } from "@/lib/types";

export const DIFFICULTIES: { id: Difficulty; label: string; emoji: string; blurb: string }[] = [
  { id: "easy", label: "Easy", emoji: "🍪", blurb: "One friendly rule. Fair letters only." },
  { id: "normal", label: "Normal", emoji: "🎄", blurb: "Sometimes a combo. A few curveballs." },
  { id: "chaos", label: "Chaos", emoji: "🔥", blurb: "Combos every time. Q, X and Z are fair game." },
];

export const DEFAULT_TWIST_CHANCE: Record<Difficulty, number> = { easy: 0.15, normal: 0.25, chaos: 0.4 };

/** Twists that suit a mode: easy gets easy twists, normal gets easy+normal, chaos gets all. */
export function defaultTwistIds(difficulty: Difficulty): string[] {
  const rank: Record<Difficulty, number> = { easy: 0, normal: 1, chaos: 2 };
  return TWISTS.filter((t) => rank[t.difficulty] <= rank[difficulty]).map((t) => t.id);
}

export function defaultSettings(difficulty: Difficulty = "normal"): GameSettings {
  return {
    priceLimit: 25,
    difficulty,
    challengeTypes: { category: true, letter: true, constraint: true },
    twists: { enabled: true, chance: DEFAULT_TWIST_CHANCE[difficulty], enabledIds: defaultTwistIds(difficulty) },
    maxStealsPerGift: 3,
    finalSwap: true,
  };
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** Turns untrusted input into valid settings, or returns an error message. */
export function parseSettings(input: unknown): { ok: true; settings: GameSettings } | { ok: false; error: string } {
  if (typeof input !== "object" || input === null) return { ok: false, error: "Missing settings" };
  const raw = input as Record<string, unknown>;

  const difficulty = (["easy", "normal", "chaos"] as const).find((d) => d === raw.difficulty);
  if (!difficulty) return { ok: false, error: "Pick a difficulty" };
  const base = defaultSettings(difficulty);

  const priceLimit = Number(raw.priceLimit);
  if (!Number.isFinite(priceLimit) || priceLimit < 1 || priceLimit > 10000) {
    return { ok: false, error: "Price limit must be between $1 and $10,000" };
  }

  const typesIn = (raw.challengeTypes ?? {}) as Record<string, unknown>;
  const challengeTypes = { ...base.challengeTypes };
  for (const t of CHALLENGE_TYPES) if (t in typesIn) challengeTypes[t] = Boolean(typesIn[t]);
  if (!CHALLENGE_TYPES.some((t) => challengeTypes[t])) return { ok: false, error: "Turn on at least one challenge type" };

  const twistsIn = (raw.twists ?? {}) as Record<string, unknown>;
  const knownIds = new Set(TWISTS.map((t) => t.id));
  const enabledIds = Array.isArray(twistsIn.enabledIds)
    ? [...new Set(twistsIn.enabledIds.filter((id): id is string => typeof id === "string" && knownIds.has(id)))]
    : base.twists.enabledIds;
  const chance = Number(twistsIn.chance ?? base.twists.chance);
  const twistsOn = twistsIn.enabled === undefined ? true : Boolean(twistsIn.enabled);

  const maxSteals = Math.round(Number(raw.maxStealsPerGift ?? 3));

  return {
    ok: true,
    settings: {
      priceLimit: Math.round(priceLimit),
      difficulty,
      challengeTypes,
      twists: {
        enabled: twistsOn && enabledIds.length > 0,
        chance: clamp(Number.isFinite(chance) ? chance : base.twists.chance, 0, 1),
        enabledIds,
      },
      maxStealsPerGift: clamp(Number.isFinite(maxSteals) ? maxSteals : 3, 1, 10),
      finalSwap: raw.finalSwap === undefined ? true : Boolean(raw.finalSwap),
    },
  };
}
