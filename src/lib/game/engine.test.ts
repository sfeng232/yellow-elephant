import { describe, expect, it } from "vitest";
import { seededRng } from "@/lib/random";
import type { Challenge, LiveState } from "@/lib/types";
import { applyAction, createLiveState, EngineError, giftHeldBy, stealableGifts, toPublic, unopenedBringers, voteSummary, type GameAction } from "./engine";

const challenge: Challenge = { rules: [{ id: "cat-kitchen", type: "category", text: "Something for the kitchen", difficulty: "easy" }] };
const settings = { maxStealsPerGift: 3, finalSwap: true };
const players = ["a", "b", "c", "d"].map((id) => ({ id, name: id.toUpperCase() }));

/** A started game with a fixed turn order a → b → c → d. */
function fresh(n = 4): LiveState {
  const s = createLiveState(players.slice(0, n), seededRng(1));
  const turnOrder = players.slice(0, n).map((p) => p.id);
  return { ...s, turnOrder, actor: turnOrder[0] };
}

let giftSeq = 0;
function open(s: LiveState, by = s.actor!, opts: { broughtBy?: string; settings?: typeof settings } = {}): LiveState {
  const broughtBy = opts.broughtBy ?? unopenedBringers(s).find((p) => p.id !== by)?.id ?? unopenedBringers(s)[0].id;
  return applyAction(s, { type: "open", by, broughtBy, label: `gift-from-${broughtBy}`, challenge, giftId: `g${++giftSeq}` }, opts.settings ?? settings);
}
const steal = (s: LiveState, giftId: string, by = s.actor!, cfg = settings) => applyAction(s, { type: "steal", by, giftId }, cfg);
const giftOf = (s: LiveState, holder: string) => giftHeldBy(s, holder)!;
const act = (s: LiveState, a: GameAction) => applyAction(s, a, settings);

describe("starting", () => {
  it("needs at least 2 players", () => {
    expect(() => createLiveState(players.slice(0, 1), seededRng(1))).toThrow(EngineError);
  });
  it("shuffles everyone into the turn order exactly once", () => {
    const s = createLiveState(players, seededRng(7));
    expect([...s.turnOrder].sort()).toEqual(["a", "b", "c", "d"]);
    expect(s.actor).toBe(s.turnOrder[0]);
    expect(s.phase).toBe("turns");
  });
  it("produces different orders for different seeds", () => {
    const orders = new Set(Array.from({ length: 20 }, (_, i) => createLiveState(players, seededRng(i)).turnOrder.join()));
    expect(orders.size).toBeGreaterThan(1);
  });
});

describe("opening", () => {
  it("gives the gift to the opener and moves to the next player", () => {
    const s = open(fresh(), "a", { broughtBy: "c" });
    expect(s.gifts).toHaveLength(1);
    expect(s.gifts[0]).toMatchObject({ holder: "a", broughtBy: "c", stealCount: 0, openedAtTurn: 1 });
    expect(s.gifts[0].challenge).toEqual(challenge);
    expect(s.actor).toBe("b");
    expect(s.turnIndex).toBe(1);
  });
  it("rejects moves from someone whose turn it isn't", () => {
    expect(() => open(fresh(), "b")).toThrow(/A's move/);
  });
  it("rejects opening a gift that's already been opened", () => {
    const s = open(fresh(), "a", { broughtBy: "c" });
    expect(() => open(s, "b", { broughtBy: "c" })).toThrow(/already been opened/);
  });
  it("rejects an empty label", () => {
    expect(() => act(fresh(), { type: "open", by: "a", broughtBy: "b", label: "  ", challenge, giftId: "x" })).toThrow(/what the gift is/);
  });
});

describe("stealing", () => {
  it("moves the gift, counts the steal, and makes the victim act next", () => {
    let s = open(fresh(), "a"); // a holds a gift, b's turn
    const g = giftOf(s, "a");
    s = steal(s, g.id, "b");
    expect(giftOf(s, "b").id).toBe(g.id);
    expect(giftOf(s, "b").stealCount).toBe(1);
    expect(giftHeldBy(s, "a")).toBeNull();
    expect(s.actor).toBe("a");
    expect(s.turnIndex).toBe(1); // still b's numbered turn
  });

  it("blocks stealing straight back, until the turn ends", () => {
    let s = open(fresh(), "a");
    const g = giftOf(s, "a");
    s = steal(s, g.id, "b");
    expect(stealableGifts(s, "a", settings)).toHaveLength(0);
    expect(() => steal(s, g.id, "a")).toThrow(/straight back/);
    s = open(s, "a"); // chain ends; now c's turn
    expect(s.actor).toBe("c");
    expect(s.noStealBack).toBeNull();
  });

  it("supports steal chains: a victim may steal a different gift", () => {
    let s = open(fresh(), "a"); // a: g1
    s = open(s, "b"); // b: g2, c's turn
    const g1 = giftOf(s, "a");
    const g2 = giftOf(s, "b");
    s = steal(s, g1.id, "c"); // a is victim
    s = steal(s, g2.id, "a"); // a steals from b
    expect(s.actor).toBe("b");
    s = open(s, "b");
    expect(s.actor).toBe("d");
    expect(giftOf(s, "c").id).toBe(g1.id);
    expect(giftOf(s, "a").id).toBe(g2.id);
  });

  it("locks a gift after the configured number of steals", () => {
    const cfg = { maxStealsPerGift: 2, finalSwap: false };
    let s = open(fresh(), "a", { settings: cfg }); // a: g, b's turn
    const g = giftOf(s, "a");
    s = steal(s, g.id, "b", cfg); // 1 steal, a acts
    s = open(s, "a", { settings: cfg }); // c's turn
    s = steal(s, g.id, "c", cfg); // 2 steals → locked; b acts
    expect(giftOf(s, "c").stealCount).toBe(2);
    expect(stealableGifts(s, "b", cfg).map((x) => x.id)).not.toContain(g.id);
    expect(() => steal(s, g.id, "b", cfg)).toThrow(/locked/);
  });

  it("can't steal when you already hold a gift or the gift doesn't exist", () => {
    const s = open(fresh(), "a");
    expect(() => steal(s, "nope", "b")).toThrow(/doesn't exist/);
  });
});

describe("ending", () => {
  function playAllOpens(s: LiveState, cfg = settings) {
    while (s.phase === "turns") s = open(s, s.actor!, { settings: cfg });
    return s;
  }

  it("goes to the final swap once every gift is open", () => {
    const s = playAllOpens(fresh());
    expect(s.gifts).toHaveLength(4);
    expect(s.phase).toBe("finalSwap");
    expect(s.actor).toBe("a");
  });

  it("final swap trades gifts and ends the game", () => {
    let s = playAllOpens(fresh());
    const mine = giftOf(s, "a");
    const theirs = giftOf(s, "d");
    s = act(s, { type: "swap", by: "a", giftId: theirs.id });
    expect(s.phase).toBe("ended");
    expect(s.actor).toBeNull();
    expect(giftOf(s, "a").id).toBe(theirs.id);
    expect(giftOf(s, "d").id).toBe(mine.id);
    expect(giftOf(s, "a").stealCount).toBe(1);
  });

  it("final swap can keep instead", () => {
    let s = playAllOpens(fresh());
    const before = s.gifts;
    s = act(s, { type: "swap", by: "a", giftId: null });
    expect(s.phase).toBe("ended");
    expect(s.gifts).toEqual(before);
  });

  it("final swap respects locks", () => {
    const cfg = { maxStealsPerGift: 1, finalSwap: true };
    let s = open(fresh(2), "a", { settings: cfg }); // b's turn
    s = steal(s, giftOf(s, "a").id, "b", cfg); // locked; a acts
    s = open(s, "a", { settings: cfg }); // all open
    // a's only option is b's locked gift, so there is no finale
    expect(s.phase).toBe("ended");
  });

  it("ends straight away when the final swap is off", () => {
    const cfg = { maxStealsPerGift: 3, finalSwap: false };
    const s = playAllOpens(fresh(), cfg);
    expect(s.phase).toBe("ended");
    expect(s.events.at(-1)?.kind).toBe("end");
  });

  it("everyone ends with exactly one gift", () => {
    for (let seed = 0; seed < 50; seed++) {
      const rng = seededRng(seed);
      let s = createLiveState(players, rng);
      let guard = 0;
      while (s.phase !== "ended" && guard++ < 200) {
        const me = s.actor!;
        if (s.phase === "finalSwap") {
          s = act(s, { type: "swap", by: me, giftId: rng() < 0.5 ? null : (stealableGifts(s, me, settings)[0]?.id ?? null) });
          continue;
        }
        const options = stealableGifts(s, me, settings);
        s = options.length > 0 && rng() < 0.6 ? steal(s, options[Math.floor(rng() * options.length)].id, me) : open(s, me);
      }
      expect(s.phase).toBe("ended");
      expect(new Set(s.gifts.map((g) => g.holder)).size).toBe(players.length);
      expect(s.gifts.every((g) => g.stealCount <= settings.maxStealsPerGift)).toBe(true);
    }
  });

  it("the host can end the game early", () => {
    const s = act(open(fresh()), { type: "end", by: "" });
    expect(s.phase).toBe("ended");
  });
});

describe("votes", () => {
  it("records, changes and clears votes, but not on your own gift", () => {
    let s = open(fresh(), "a", { broughtBy: "c" });
    const id = s.gifts[0].id;
    s = act(s, { type: "vote", by: "b", giftId: id, vote: "up" });
    s = act(s, { type: "vote", by: "d", giftId: id, vote: "down" });
    s = act(s, { type: "vote", by: "a", giftId: id, vote: "down" });
    expect(voteSummary(s.gifts[0])).toEqual({ up: 1, down: 2, ruleBreaker: true });
    s = act(s, { type: "vote", by: "a", giftId: id, vote: null });
    expect(voteSummary(s.gifts[0])).toEqual({ up: 1, down: 1, ruleBreaker: false });
    expect(() => act(s, { type: "vote", by: "c", giftId: id, vote: "up" })).toThrow(/own gift/);
  });

  it("doesn't change whose turn it is", () => {
    const s = open(fresh(), "a", { broughtBy: "c" });
    const after = act(s, { type: "vote", by: "b", giftId: s.gifts[0].id, vote: "up" });
    expect(after.actor).toBe(s.actor);
    expect(after.undo).toHaveLength(s.undo.length);
  });
});

describe("undo", () => {
  it("reverts the last move but keeps newer votes", () => {
    let s = open(fresh(), "a", { broughtBy: "c" });
    const gid = s.gifts[0].id;
    s = steal(s, gid, "b");
    s = act(s, { type: "vote", by: "d", giftId: gid, vote: "up" });
    s = act(s, { type: "undo", by: "" });
    expect(giftOf(s, "a").id).toBe(gid);
    expect(s.actor).toBe("b");
    expect(s.gifts[0].votes).toEqual({ d: "up" });
    s = act(s, { type: "undo", by: "" });
    expect(s.gifts).toHaveLength(0);
    expect(s.actor).toBe("a");
    expect(() => act(s, { type: "undo", by: "" })).toThrow(/Nothing to undo/);
  });

  it("keeps the event sequence increasing", () => {
    let s = open(fresh());
    const seq = s.seq;
    s = act(s, { type: "undo", by: "" });
    expect(s.seq).toBeGreaterThan(seq);
  });

  it("public state hides the undo history", () => {
    const pub = toPublic(open(fresh()));
    expect(pub).not.toHaveProperty("undo");
    expect(pub.canUndo).toBe(true);
  });
});
