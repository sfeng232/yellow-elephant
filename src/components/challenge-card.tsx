"use client";

import type { Challenge, ChallengeType } from "@/lib/types";

export const TYPE_META: Record<ChallengeType, { label: string; emoji: string; className: string }> = {
  category: { label: "Category", emoji: "🏷️", className: "bg-pine/10 text-pine" },
  letter: { label: "Letter rule", emoji: "🔤", className: "bg-gold-soft text-[#7a5410]" },
  constraint: { label: "Constraint", emoji: "📏", className: "bg-berry/10 text-berry-deep" },
};

/** Games created before a type was removed may still hold rules of that type. */
const FALLBACK_META = { label: "Rule", emoji: "📌", className: "bg-ink/5 text-ink" };

export function RuleList({ challenge, animate = false }: { challenge: Challenge; animate?: boolean }) {
  return (
    <ul className="space-y-2.5">
      {challenge.rules.map((rule, i) => {
        const meta = TYPE_META[rule.type] ?? FALLBACK_META;
        return (
          <li
            key={rule.id}
            className={`rounded-2xl bg-white p-3.5 ring-1 ring-ink/5 ${animate ? "animate-float-up" : ""}`}
            style={animate ? { animationDelay: `${250 + i * 140}ms` } : undefined}
          >
            <span className={`mb-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${meta.className}`}>
              <span aria-hidden>{meta.emoji}</span> {meta.label}
            </span>
            <p className="font-display text-lg font-semibold leading-snug">{rule.text}</p>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The secret challenge. Face down shows a candy-cane card; tapping flips it.
 * `revealed` is controlled by the parent so it can flip back down after a re-roll.
 */
export function ChallengeCard({
  challenge,
  revealed,
  onToggle,
  rerollKey,
}: {
  challenge: Challenge;
  revealed: boolean;
  onToggle: () => void;
  /** Changes when the challenge is re-rolled, to replay the entrance animation. */
  rerollKey: string;
}) {
  const combo = challenge.rules.length > 1;
  return (
    <div className="flip">
      <div className={`flip-inner grid ${revealed ? "is-flipped" : ""}`}>
        {/* Face down */}
        <button
          type="button"
          onClick={onToggle}
          aria-label="Reveal your secret challenge"
          aria-hidden={revealed}
          tabIndex={revealed ? -1 : 0}
          className="flip-face candy-stripes col-start-1 row-start-1 flex min-h-72 flex-col items-center justify-center gap-3 rounded-3xl p-6 text-white shadow-lg ring-4 ring-white"
        >
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-white text-4xl shadow-md">
            <span className="animate-wiggle" aria-hidden>
              🎁
            </span>
          </span>
          <span className="rounded-full bg-white/95 px-4 py-1.5 font-display text-lg font-semibold text-berry-deep">
            Tap to reveal your challenge
          </span>
          <span className="text-sm font-medium text-white/90">Make sure nobody&apos;s peeking 👀</span>
        </button>

        {/* Face up */}
        <div
          aria-hidden={!revealed}
          className="flip-face flip-back col-start-1 row-start-1 flex min-h-72 flex-col rounded-3xl bg-cream p-5 shadow-lg ring-4 ring-white"
        >
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-bold uppercase tracking-widest text-berry">
              {combo ? "Combo challenge" : "Your secret challenge"}
            </p>
            <button type="button" onClick={onToggle} tabIndex={revealed ? 0 : -1} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-muted ring-1 ring-ink/10">
              Hide
            </button>
          </div>
          <div key={rerollKey} className="flex-1">
            <RuleList challenge={challenge} animate={revealed} />
          </div>
          <p className="mt-4 text-xs text-muted">Your gift must follow every rule above. Your challenge gets revealed to the group when your gift is opened.</p>
        </div>
      </div>
    </div>
  );
}
