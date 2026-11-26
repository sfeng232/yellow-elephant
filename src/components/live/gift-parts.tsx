"use client";

import { RuleList } from "@/components/challenge-card";
import { isLocked, playerName, voteSummary } from "@/lib/game/engine";
import type { Gift, PublicLiveState, Vote } from "@/lib/types";

/** Dots showing how many steals a gift has left before it locks. */
export function StealMeter({ gift, max }: { gift: Gift; max: number }) {
  const locked = gift.stealCount >= max;
  return (
    <span className="inline-flex items-center gap-1" aria-label={locked ? "Locked" : `Stolen ${gift.stealCount} of ${max} times`}>
      {locked ? (
        <span className="rounded-full bg-ink/80 px-2 py-0.5 text-xs font-semibold text-white">🔒 Locked</span>
      ) : (
        Array.from({ length: max }, (_, i) => (
          <span key={i} className={`h-2 w-2 rounded-full ${i < gift.stealCount ? "bg-berry" : "bg-ink/15"}`} />
        ))
      )}
    </span>
  );
}

export function VoteButtons({
  gift,
  myId,
  onVote,
  busy,
  size = "md",
}: {
  gift: Gift;
  myId: string | null;
  onVote: (vote: Vote | null) => void;
  busy?: boolean;
  size?: "md" | "lg";
}) {
  const { up, down, ruleBreaker } = voteSummary(gift);
  const mine = myId ? gift.votes[myId] : undefined;
  const canVote = myId !== null && myId !== gift.broughtBy;
  const pad = size === "lg" ? "px-5 py-3 text-lg" : "px-3 py-1.5 text-sm";
  const btn = (v: Vote, emoji: string, count: number) => (
    <button
      type="button"
      disabled={!canVote || busy}
      onClick={() => onVote(mine === v ? null : v)}
      aria-pressed={mine === v}
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold transition-all active:scale-90 disabled:cursor-default ${pad} ${
        mine === v ? (v === "up" ? "bg-pine text-white scale-105" : "bg-berry text-white scale-105") : "bg-white ring-1 ring-ink/10"
      } ${!canVote ? "opacity-80" : ""}`}
    >
      <span aria-hidden>{emoji}</span> {count}
    </button>
  );
  return (
    <div className="flex flex-wrap items-center gap-2">
      {btn("up", "👍", up)}
      {btn("down", "👎", down)}
      {ruleBreaker && <span className="rounded-full bg-berry/10 px-2.5 py-1 text-xs font-bold text-berry-deep animate-pop-in">🚨 Rule breaker</span>}
      {myId === gift.broughtBy && <span className="text-xs text-muted">(your gift: no voting!)</span>}
    </div>
  );
}

export function GiftRow({
  state,
  gift,
  max,
  myId,
  onVote,
  highlight,
}: {
  state: PublicLiveState;
  gift: Gift;
  max: number;
  myId: string | null;
  onVote: (vote: Vote | null) => void;
  highlight?: boolean;
}) {
  return (
    <li className={`rounded-2xl bg-cream p-3.5 animate-pop-in ${highlight ? "ring-2 ring-gold" : ""} ${isLocked(gift, { maxStealsPerGift: max, finalSwap: false }) ? "opacity-90" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-lg font-semibold leading-tight">{gift.label}</p>
          <p className="text-sm text-muted">
            Held by <span className="font-semibold text-ink">{playerName(state, gift.holder)}</span> · from {playerName(state, gift.broughtBy)}
          </p>
        </div>
        <StealMeter gift={gift} max={max} />
      </div>
      <details className="mt-2 group">
        <summary className="cursor-pointer text-sm font-semibold text-pine">
          {playerName(state, gift.broughtBy)}&apos;s challenge <span className="group-open:hidden">▸</span>
          <span className="hidden group-open:inline">▾</span>
        </summary>
        <div className="mt-2">
          <RuleList challenge={gift.challenge} />
        </div>
      </details>
      <div className="mt-3">
        <VoteButtons gift={gift} myId={myId} onVote={onVote} />
      </div>
    </li>
  );
}
