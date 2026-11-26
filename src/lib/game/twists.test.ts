import { describe, expect, it } from "vitest";
import { TWISTS } from "@/data/twists";
import { seededRng, type Rng } from "@/lib/random";
import type { Challenge, LiveState, TwistDef } from "@/lib/types";
import { computeAwards } from "./awards";
import { applyAction, canOpen, createLiveState, giftHeldBy, isLocked, stealableGifts, stealBlock, unopenedBringers, type EngineSettings } from "./engine";
import { applyTwist, rollTwist, twistApplicable } from "./twists";

const challenge: Challenge = { rules: [{ id: "x", type: "category", text: "Anything", difficulty: "easy" }] };
const players = ["a", "b", "c", "d", "e"].map((id) => ({ id, name: id.toUpperCase() }));
const base: EngineSettings = { maxStealsPerGift: 3, finalSwap: false };
const twist = (id: string) => TWISTS.find((t) => t.id === id)!;
const always = (ids: string[]): EngineSettings => ({ ...base, twists: { enabled: true, chance: 1, enabledIds: ids } });
const never: Rng = () => 0.99;

let n = 0;
/** Start a game with order a→b→c→d→e and have the first `k` players open (no twists). */
function opened(k: number, settings: EngineSettings = base): LiveState {
  let s = createLiveState(players, seededRng(1));
  s = { ...s, turnOrder: players.map((p) => p.id), actor: "a" };
  for (let i = 0; i < k; i++) {
    const by = s.actor!;
    const broughtBy = unopenedBringers(s).find((p) => p.id !== by)!.id;
    s = applyAction(s, { type: "open", by, broughtBy, label: `g-${broughtBy}`, challenge, giftId: `g${++n}` }, settings, never);
  }
  return s;
}
const holders = (s: LiveState) => Object.fromEntries(s.gifts.map((g) => [g.id, g.holder]));
const run = (s: LiveState, id: string, settings = base, rng: Rng = seededRng(3)) => applyTwist(s, twist(id), settings, rng).state;

describe("rolling twists", () => {
  it("never fires when twists are off or the chance is 0", () => {
    const s = opened(2);
    expect(rollTwist(s, base, () => 0)).toBeNull();
    expect(rollTwist(s, { ...base, twists: { enabled: false, chance: 1, enabledIds: ["reverse"] } }, () => 0)).toBeNull();
    expect(rollTwist(s, { ...base, twists: { enabled: true, chance: 0, enabledIds: ["reverse"] } }, () => 0)).toBeNull();
  });

  it("fires at roughly the configured chance", () => {
    const s = opened(2);
    const rng = seededRng(5);
    const cfg = { ...base, twists: { enabled: true, chance: 0.25, enabledIds: TWISTS.map((t) => t.id) } };
    const fired = Array.from({ length: 4000 }, () => rollTwist(s, cfg, rng)).filter(Boolean).length;
    expect(fired / 4000).toBeGreaterThan(0.2);
    expect(fired / 4000).toBeLessThan(0.3);
  });

  it("only picks enabled twists", () => {
    const s = opened(3);
    const rng = seededRng(6);
    for (let i = 0; i < 300; i++) expect(rollTwist(s, always(["reverse", "pass-left"]), rng)?.id).toMatch(/^(reverse|pass-left)$/);
  });

  it("skips twists that would do nothing", () => {
    const s = opened(1); // one holder: passing or swapping is pointless
    expect(twistApplicable(s, twist("pass-left"), base)).toBe(false);
    expect(twistApplicable(s, twist("swap-random"), base)).toBe(false);
    expect(twistApplicable(s, twist("unlock-all"), base)).toBe(false); // nothing locked
    expect(rollTwist(s, always(["pass-left", "swap-random"]), () => 0)).toBeNull();
  });

  it("fires after an open and is logged as an event", () => {
    const s = opened(1);
    const after = applyAction(s, { type: "open", by: "b", broughtBy: "c", label: "x", challenge, giftId: "z" }, always(["reverse"]), () => 0);
    expect(after.events.at(-1)).toMatchObject({ kind: "twist", twistId: "reverse" });
  });

  it("never fires after a steal", () => {
    const s = opened(1);
    const after = applyAction(s, { type: "steal", by: "b", giftId: s.gifts[0].id }, always(["reverse"]), () => 0);
    expect(after.events.at(-1)?.kind).toBe("steal");
  });
});

describe("twist effects", () => {
  it("pass left moves every gift to the next holder in turn order", () => {
    const s = opened(3); // a, b, c hold gifts
    const before = holders(s);
    const after = holders(run(s, "pass-left"));
    const next = { a: "b", b: "c", c: "a" } as Record<string, string>;
    for (const id of Object.keys(before)) expect(after[id]).toBe(next[before[id]]);
  });

  it("pass right goes the other way", () => {
    const s = opened(3);
    const before = holders(s);
    const after = holders(run(s, "pass-right"));
    const prev = { a: "c", b: "a", c: "b" } as Record<string, string>;
    for (const id of Object.keys(before)) expect(after[id]).toBe(prev[before[id]]);
  });

  it("reverse flips the remaining turn order and hands the move over", () => {
    const s = opened(2); // c is up, then d, e
    expect(s.actor).toBe("c");
    const r = run(s, "reverse");
    expect(r.turnOrder).toEqual(["a", "b", "e", "d", "c"]);
    expect(r.actor).toBe("e");
  });

  it("steal freeze blocks steals for exactly N turns", () => {
    let s = run(opened(2), "steal-lock-2"); // c's turn, frozen
    expect(stealableGifts(s, "c", base)).toHaveLength(0);
    expect(stealBlock(s, s.gifts[0], "c", base)).toBe("frozen");
    s = applyAction(s, { type: "open", by: "c", broughtBy: "d", label: "x", challenge, giftId: "f1" }, base, never);
    expect(stealableGifts(s, "d", base).length).toBe(0); // 2nd frozen turn
    s = applyAction(s, { type: "open", by: "d", broughtBy: "e", label: "y", challenge, giftId: "f2" }, base, never);
    expect(stealableGifts(s, "e", base).length).toBeGreaterThan(0); // thawed
  });

  it("amnesty unlocks locked gifts without losing the steal count", () => {
    const cfg = { ...base, maxStealsPerGift: 1 };
    let s = opened(1, cfg);
    s = applyAction(s, { type: "steal", by: "b", giftId: s.gifts[0].id }, cfg, never); // locked
    expect(isLocked(s.gifts[0], cfg)).toBe(true);
    s = run(s, "unlock-all", cfg);
    expect(isLocked(s.gifts[0], cfg)).toBe(false);
    expect(s.gifts[0].stealCount).toBe(1);
  });

  it("free steal doesn't count toward the lock", () => {
    const cfg = { ...base, maxStealsPerGift: 1 };
    let s = run(opened(1, cfg), "free-steal", cfg);
    s = applyAction(s, { type: "steal", by: "b", giftId: s.gifts[0].id }, cfg, never);
    expect(s.gifts[0].stealCount).toBe(1);
    expect(isLocked(s.gifts[0], cfg)).toBe(false);
    expect(s.modifiers?.freeSteal).toBeFalsy(); // used up
  });

  it("fresh gifts only blocks stealing for one move", () => {
    const s = run(opened(2), "must-open");
    expect(stealableGifts(s, "c", base)).toHaveLength(0);
    expect(() => applyAction(s, { type: "steal", by: "c", giftId: s.gifts[0].id }, base, never)).toThrow(/Fresh gifts/);
    const after = applyAction(s, { type: "open", by: "c", broughtBy: "d", label: "x", challenge, giftId: "m1" }, base, never);
    expect(after.modifiers?.mustOpen).toBeFalsy();
  });

  it("heist forbids opening while something can be stolen", () => {
    const s = run(opened(2), "must-steal");
    expect(canOpen(s, "c", base)).toBe(false);
    expect(() => applyAction(s, { type: "open", by: "c", broughtBy: "d", label: "x", challenge, giftId: "h1" }, base, never)).toThrow(/Heist/);
    const after = applyAction(s, { type: "steal", by: "c", giftId: s.gifts[0].id }, base, never);
    expect(canOpen(after, after.actor!, base)).toBe(true);
  });

  it("second thoughts gives the last opener a bonus swap, then play resumes", () => {
    const s = opened(3); // c opened last, d is up
    const t = run(s, "prev-swap");
    expect(t.phase).toBe("bonusSwap");
    expect(t.actor).toBe("c");
    const target = giftHeldBy(t, "a")!;
    const mine = giftHeldBy(t, "c")!;
    const after = applyAction(t, { type: "swap", by: "c", giftId: target.id }, base, never);
    expect(after.phase).toBe("turns");
    expect(after.actor).toBe("d");
    expect(giftHeldBy(after, "c")!.id).toBe(target.id);
    expect(giftHeldBy(after, "a")!.id).toBe(mine.id);
    expect(after.stats?.steals.c).toBe(1);
  });

  it("a bonus swap can be declined", () => {
    const t = run(opened(3), "prev-swap");
    const after = applyAction(t, { type: "swap", by: "c", giftId: null }, base, never);
    expect(after.phase).toBe("turns");
    expect(after.actor).toBe("d");
    expect(after.gifts).toEqual(t.gifts);
  });

  it("random swap and blizzard keep exactly one gift per holder", () => {
    for (const id of ["swap-random", "shuffle-all", "pass-left"]) {
      const s = opened(4);
      const after = run(s, id);
      expect(new Set(after.gifts.map((g) => g.holder))).toEqual(new Set(s.gifts.map((g) => g.holder)));
      expect(after.gifts.map((g) => g.holder)).not.toEqual(s.gifts.map((g) => g.holder));
    }
  });

  it("announce twists change nothing", () => {
    const s = opened(2);
    expect(run(s, "show-and-tell")).toEqual(s);
  });

  it("every twist in the data file has a working effect", () => {
    const s = opened(4);
    for (const t of TWISTS as TwistDef[]) {
      if (!twistApplicable(s, t, base)) continue;
      expect(() => applyTwist(s, t, base, seededRng(1))).not.toThrow();
    }
  });
});

describe("full games with twists", () => {
  it("always finish with one gift each, whatever twists fire", () => {
    const cfg: EngineSettings = { maxStealsPerGift: 2, finalSwap: true, twists: { enabled: true, chance: 0.6, enabledIds: TWISTS.map((t) => t.id) } };
    for (let seed = 0; seed < 150; seed++) {
      const rng = seededRng(seed);
      let s = createLiveState(players, rng);
      let guard = 0;
      while (s.phase !== "ended" && guard++ < 300) {
        const me = s.actor!;
        if (s.phase === "bonusSwap" || s.phase === "finalSwap") {
          const options = stealableGifts(s, me, cfg);
          s = applyAction(s, { type: "swap", by: me, giftId: rng() < 0.5 || options.length === 0 ? null : options[0].id }, cfg, rng);
          continue;
        }
        const options = stealableGifts(s, me, cfg);
        const mustSteal = !canOpen(s, me, cfg);
        if (options.length > 0 && (mustSteal || rng() < 0.5)) {
          s = applyAction(s, { type: "steal", by: me, giftId: options[Math.floor(rng() * options.length)].id }, cfg, rng);
        } else {
          const broughtBy = unopenedBringers(s)[0].id;
          s = applyAction(s, { type: "open", by: me, broughtBy, label: "g", challenge, giftId: `s${seed}-${guard}` }, cfg, rng);
        }
      }
      expect(s.phase, `seed ${seed}`).toBe("ended");
      expect(new Set(s.gifts.map((g) => g.holder)).size).toBe(players.length);
    }
  });
});

describe("awards", () => {
  function finished() {
    const cfg = { ...base, maxStealsPerGift: 5 };
    let s = opened(2, cfg); // a holds b's gift (g1), b holds a's gift (g2); c's turn
    const [g1, g2] = s.gifts;
    s = applyAction(s, { type: "steal", by: "c", giftId: g1.id }, cfg, never); // c steals from a
    s = applyAction(s, { type: "steal", by: "a", giftId: g2.id }, cfg, never); // a steals from b
    s = applyAction(s, { type: "steal", by: "b", giftId: g1.id }, cfg, never); // b steals g1 from c
    s = applyAction(s, { type: "vote", by: "a", giftId: g1.id, vote: "up" }, cfg);
    s = applyAction(s, { type: "vote", by: "d", giftId: g1.id, vote: "up" }, cfg);
    s = applyAction(s, { type: "vote", by: "e", giftId: g2.id, vote: "down" }, cfg);
    s = applyAction(s, { type: "creativeVote", by: "d", giftId: g2.id }, cfg);
    s = applyAction(s, { type: "creativeVote", by: "e", giftId: g2.id }, cfg);
    return { s, g1, g2 };
  }

  it("names the right winners", () => {
    const { s, g1, g2 } = finished();
    const byId = Object.fromEntries(computeAwards(s).map((a) => [a.id, a]));
    expect(byId["most-stolen"]).toMatchObject({ winners: [g1.broughtBy], giftId: g1.id });
    expect(byId["rule-follower"].winners).toEqual([g1.broughtBy]);
    expect(byId["rule-breaker"].winners).toEqual([g2.broughtBy]);
    expect(byId["most-creative"].winners).toEqual([g2.broughtBy]);
    expect(byId["biggest-thief"].winners.sort()).toEqual(["a", "b", "c"]); // 1 steal each: a tie
    expect(byId["most-robbed"].winners.sort()).toEqual(["a", "b", "c"]);
  });

  it("leaves out awards nobody earned", () => {
    const ids = computeAwards(opened(2)).map((a) => a.id);
    expect(ids).toEqual([]);
  });

  it("creative votes can't go to your own gift", () => {
    const { s, g1 } = finished();
    expect(() => applyAction(s, { type: "creativeVote", by: g1.broughtBy, giftId: g1.id }, base)).toThrow(/own gift/);
  });
});
