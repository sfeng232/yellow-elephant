import type { Gift, LiveState, PublicLiveState } from "@/lib/types";
import { voteSummary } from "./rules";

export interface Award {
  id: string;
  emoji: string;
  title: string;
  /** Player ids (more than one on a tie). */
  winners: string[];
  detail: string;
  giftId?: string;
}

type AnyState = LiveState | PublicLiveState;

/** Everyone tied for the top score, as long as the top score reaches `min`. */
function top<T>(items: T[], score: (t: T) => number, min = 1): T[] {
  if (items.length === 0) return [];
  const best = Math.max(...items.map(score));
  if (best < min) return [];
  return items.filter((t) => score(t) === best);
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Awards for the end screen. Awards nobody earned are left out. */
export function computeAwards(state: AnyState): Award[] {
  const awards: Award[] = [];
  const gifts = state.gifts;
  const label = (g: Gift) => `“${g.label}”`;
  const giftAward = (id: string, emoji: string, title: string, winners: Gift[], detail: (g: Gift) => string) => {
    if (winners.length === 0) return;
    awards.push({ id, emoji, title, winners: [...new Set(winners.map((g) => g.broughtBy))], detail: winners.map(detail).join(" · "), giftId: winners[0].id });
  };

  giftAward("most-stolen", "🏆", "Most Stolen", top(gifts, (g) => g.stealCount), (g) => `${label(g)}, stolen ${plural(g.stealCount, "time")}`);

  giftAward(
    "rule-follower",
    "😇",
    "Best Rule Follower",
    top(gifts, (g) => {
      const v = voteSummary(g);
      return v.up - v.down;
    }),
    (g) => `${label(g)}, ${voteSummary(g).up} 👍`,
  );

  const creativeCounts = new Map<string, number>();
  for (const giftId of Object.values(state.creativeVotes ?? {})) creativeCounts.set(giftId, (creativeCounts.get(giftId) ?? 0) + 1);
  giftAward("most-creative", "🎨", "Most Creative Interpretation", top(gifts, (g) => creativeCounts.get(g.id) ?? 0), (g) => `${label(g)}, ${plural(creativeCounts.get(g.id) ?? 0, "vote")}`);

  giftAward(
    "rule-breaker",
    "🚨",
    "Rule Breaker",
    top(gifts, (g) => {
      const v = voteSummary(g);
      return v.down - v.up;
    }),
    (g) => `${label(g)}, ${voteSummary(g).down} 👎`,
  );

  const steals = state.stats?.steals ?? {};
  const thieves = top(Object.keys(steals), (id) => steals[id]);
  if (thieves.length) awards.push({ id: "biggest-thief", emoji: "🦹", title: "Biggest Thief", winners: thieves, detail: plural(steals[thieves[0]], "steal") });

  const robbed = state.stats?.stolenFrom ?? {};
  const victims = top(Object.keys(robbed), (id) => robbed[id]);
  if (victims.length) awards.push({ id: "most-robbed", emoji: "😭", title: "Most Robbed", winners: victims, detail: `lost a gift ${plural(robbed[victims[0]], "time")}` });

  return awards;
}
