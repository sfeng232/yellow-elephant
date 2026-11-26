import { describe, expect, it } from "vitest";
import { CHALLENGES, LETTER_POOLS } from "@/data/challenges";
import { TWISTS } from "@/data/twists";
import { challengeKey, fillText, generateChallenge, generateLetterRule, rerollChallenge } from "@/lib/challenges";
import { seededRng } from "@/lib/random";
import { defaultSettings, parseSettings } from "@/lib/settings";
import type { ChallengeType, Difficulty } from "@/lib/types";

const MODES: Difficulty[] = ["easy", "normal", "chaos"];
const allOn = { category: true, letter: true, constraint: true };
const only = (t: ChallengeType) => ({ category: false, letter: false, constraint: false, [t]: true });

describe("seed data", () => {
  it("has at least 40 challenges and 15 twists with unique ids", () => {
    expect(CHALLENGES.length).toBeGreaterThanOrEqual(40);
    expect(TWISTS.length).toBeGreaterThanOrEqual(15);
    expect(new Set(CHALLENGES.map((c) => c.id)).size).toBe(CHALLENGES.length);
    expect(new Set(TWISTS.map((t) => t.id)).size).toBe(TWISTS.length);
  });

  it("is balanced: every type has rules at every difficulty", () => {
    for (const type of ["category", "constraint"] as const) {
      for (const d of MODES) {
        expect(CHALLENGES.filter((c) => c.type === type && c.difficulty === d).length, `${type}/${d}`).toBeGreaterThanOrEqual(3);
      }
    }
    for (const d of MODES) expect(TWISTS.filter((t) => t.difficulty === d).length, d).toBeGreaterThanOrEqual(4);
  });
});

describe("letter rules", () => {
  it("never uses Q, X or Z on easy mode", () => {
    for (const pool of Object.values(LETTER_POOLS)) expect(pool.easy).not.toMatch(/[QXZ]/);
    const rng = seededRng(1);
    for (let i = 0; i < 2000; i++) {
      const rule = generateLetterRule("easy", rng);
      expect(rule.text).not.toMatch(/"[QXZ]"/);
      expect(rule.difficulty).toBe("easy");
    }
  });

  it("keeps Q, X and Z out of normal mode too, but allows them in chaos", () => {
    const rng = seededRng(2);
    const normal = Array.from({ length: 2000 }, () => generateLetterRule("normal", rng).text);
    expect(normal.some((t) => /"[QXZ]"/.test(t))).toBe(false);
    const chaos = Array.from({ length: 2000 }, () => generateLetterRule("chaos", rng).text);
    expect(chaos.some((t) => /"[QXZ]"/.test(t))).toBe(true);
  });

  it("uses all three phrasings", () => {
    const rng = seededRng(3);
    const texts = Array.from({ length: 300 }, () => generateLetterRule("normal", rng).text);
    expect(texts.some((t) => t.includes("starts with"))).toBe(true);
    expect(texts.some((t) => t.includes("ends with"))).toBe(true);
    expect(texts.some((t) => t.includes("contains"))).toBe(true);
  });
});

describe("generateChallenge", () => {
  it("easy gives exactly one gift rule, using only easy rules", () => {
    const rng = seededRng(4);
    for (let i = 0; i < 500; i++) {
      const c = generateChallenge({ settings: { ...defaultSettings("easy"), challengeTypes: allOn }, rng });
      expect(c.rules).toHaveLength(1);
      expect(c.rules.every((r) => r.difficulty === "easy")).toBe(true);
    }
  });

  it("normal never uses chaos rules and sometimes combos", () => {
    const rng = seededRng(5);
    const all = Array.from({ length: 500 }, () => generateChallenge({ settings: defaultSettings("normal"), rng }));
    expect(all.every((c) => c.rules.every((r) => r.difficulty !== "chaos"))).toBe(true);
    expect(all.some((c) => c.rules.length === 2)).toBe(true);
  });

  it("chaos always combos (2–3 gift rules) when all types are on", () => {
    const rng = seededRng(6);
    for (let i = 0; i < 500; i++) {
      const n = generateChallenge({ settings: defaultSettings("chaos"), rng }).rules.length;
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(3);
    }
  });

  it("never gives two rules of the same type", () => {
    const rng = seededRng(7);
    for (const mode of MODES) {
      for (let i = 0; i < 300; i++) {
        const types = generateChallenge({ settings: defaultSettings(mode), rng }).rules.map((r) => r.type);
        expect(new Set(types).size).toBe(types.length);
      }
    }
  });

  it("only uses enabled types", () => {
    const rng = seededRng(8);
    for (const t of ["category", "letter", "constraint"] as const) {
      for (let i = 0; i < 100; i++) {
        const c = generateChallenge({ settings: { ...defaultSettings("chaos"), challengeTypes: only(t) }, rng });
        expect(c.rules.length).toBeGreaterThan(0);
        expect(c.rules.every((r) => r.type === t)).toBe(true);
      }
    }
  });

  it("ignores the removed wrapping type in games saved before it was removed", () => {
    const old = { ...defaultSettings("chaos"), challengeTypes: { ...allOn, wrapping: true } as typeof allOn };
    const c = generateChallenge({ settings: old, rng: seededRng(13) });
    expect(c.rules.every((r) => ["category", "letter", "constraint"].includes(r.type))).toBe(true);
    const onlyWrapping = { category: false, letter: false, constraint: false, wrapping: true } as unknown as typeof allOn;
    expect(() => generateChallenge({ settings: { ...defaultSettings(), challengeTypes: onlyWrapping } })).toThrow(/at least one/i);
  });

  it("throws if nothing is enabled", () => {
    const off = { category: false, letter: false, constraint: false };
    expect(() => generateChallenge({ settings: { ...defaultSettings(), challengeTypes: off } })).toThrow();
  });

  it("never pairs conflicting rules (e.g. edible + lights up)", () => {
    const rng = seededRng(9);
    const byId = new Map(CHALLENGES.map((c) => [c.id, c]));
    for (let i = 0; i < 2000; i++) {
      const defs = generateChallenge({ settings: defaultSettings("chaos"), rng }).rules.map((r) => byId.get(r.id)).filter((d) => d !== undefined);
      for (const a of defs) for (const b of defs) {
        if (a === b) continue;
        expect((a.conflicts ?? []).some((tag) => (b.tags ?? []).includes(tag)), `${a.id} + ${b.id}`).toBe(false);
      }
    }
  });

  it("fills price placeholders from the price limit", () => {
    expect(fillText("Costs under {half}", 30)).toBe("Costs under $15");
    expect(fillText("Under {quarter}", 10)).toBe("Under $3");
    expect(fillText("{limit} max", 25)).toBe("$25 max");
    const c = generateChallenge({ settings: { ...defaultSettings("easy"), priceLimit: 40, challengeTypes: only("constraint") }, rng: seededRng(10) });
    expect(c.rules[0].text).not.toMatch(/[{}]/);
  });

  it("is deterministic for a given seed", () => {
    const a = generateChallenge({ settings: defaultSettings("chaos"), rng: seededRng(42) });
    const b = generateChallenge({ settings: defaultSettings("chaos"), rng: seededRng(42) });
    expect(a).toEqual(b);
  });

  it("avoids rules other players already have when it can", () => {
    const rng = seededRng(11);
    const settings = { ...defaultSettings("easy"), challengeTypes: only("category") };
    const easyCategories = CHALLENGES.filter((c) => c.type === "category" && c.difficulty === "easy");
    const used = new Set<string>();
    for (let i = 0; i < easyCategories.length; i++) {
      const id = generateChallenge({ settings, rng, avoidIds: used }).rules[0].id;
      expect(used.has(id)).toBe(false);
      used.add(id);
    }
  });
});

describe("rerollChallenge", () => {
  it("returns a different challenge", () => {
    const rng = seededRng(12);
    for (const mode of MODES) {
      for (let i = 0; i < 200; i++) {
        const current = generateChallenge({ settings: defaultSettings(mode), rng });
        const next = rerollChallenge(current, { settings: defaultSettings(mode), rng });
        expect(challengeKey(next)).not.toBe(challengeKey(current));
      }
    }
  });
});

describe("parseSettings", () => {
  it("accepts defaults", () => {
    expect(parseSettings(defaultSettings("chaos"))).toMatchObject({ ok: true });
  });
  it("rejects bad input", () => {
    expect(parseSettings(null).ok).toBe(false);
    expect(parseSettings({ ...defaultSettings(), difficulty: "nightmare" }).ok).toBe(false);
    expect(parseSettings({ ...defaultSettings(), priceLimit: 0 }).ok).toBe(false);
    expect(parseSettings({ ...defaultSettings(), challengeTypes: { category: false, letter: false, constraint: false } }).ok).toBe(false);
  });
  it("clamps and cleans values", () => {
    const r = parseSettings({ ...defaultSettings(), maxStealsPerGift: 99, twists: { enabled: true, chance: 7, enabledIds: ["reverse", "nope", "reverse"] } });
    expect(r.ok && r.settings.maxStealsPerGift).toBe(10);
    expect(r.ok && r.settings.twists.chance).toBe(1);
    expect(r.ok && r.settings.twists.enabledIds).toEqual(["reverse"]);
  });
});
