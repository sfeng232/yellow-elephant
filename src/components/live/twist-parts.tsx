"use client";

import { computeAwards } from "@/lib/game/awards";
import { playerName } from "@/lib/game/engine";
import { twistById } from "@/lib/game/twists";
import type { GameEvent, PublicLiveState } from "@/lib/types";

/** The big announcement card for a twist. `size="tv"` for the host screen. */
export function TwistCard({ event, size = "phone" }: { event: GameEvent; size?: "phone" | "tv" }) {
  const twist = twistById(event.twistId);
  if (!twist) return null;
  const tv = size === "tv";
  return (
    <div className={`relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-berry via-berry-deep to-pine-deep text-center text-white shadow-2xl animate-pop-in ${tv ? "px-16 py-14" : "p-7"}`}>
      <div className="pointer-events-none absolute inset-0 opacity-20 candy-stripes" aria-hidden />
      <div className="relative">
        <p className={`font-bold uppercase tracking-[0.3em] text-gold-soft ${tv ? "text-2xl" : "text-xs"}`}>Twist!</p>
        <p className={`my-3 inline-block animate-wiggle ${tv ? "text-[9rem] leading-none" : "text-7xl"}`} aria-hidden>
          {twist.emoji}
        </p>
        <h2 className={`font-display font-extrabold ${tv ? "text-7xl" : "text-3xl"}`}>{twist.title}</h2>
        <p className={`mx-auto mt-3 max-w-xl text-white/90 ${tv ? "text-3xl" : "text-base"}`}>{twist.description}</p>
        {event.note && <p className={`mt-4 inline-block rounded-full bg-white/15 px-4 py-1.5 font-semibold ${tv ? "text-2xl" : "text-sm"}`}>{event.note}</p>}
      </div>
    </div>
  );
}

/** Small chips for the rules currently in force (steal freeze, heist…). */
export function ActiveEffects({ live, size = "phone" }: { live: PublicLiveState; size?: "phone" | "tv" }) {
  const chips: string[] = [];
  const freeze = live.stealLockTurns ?? 0;
  if (freeze > 0) chips.push(`🔒 Steal freeze: ${freeze} turn${freeze === 1 ? "" : "s"} left`);
  if (live.modifiers?.mustOpen) chips.push("🎁 Fresh gifts only this move");
  if (live.modifiers?.mustSteal) chips.push("🦹 Heist: must steal");
  if (live.modifiers?.freeSteal) chips.push("🎟️ Next steal is free");
  if (live.modifiers?.blindPick) chips.push("🙈 Mystery pick");
  if (chips.length === 0) return null;
  return (
    <div className={`flex flex-wrap justify-center gap-2 ${size === "tv" ? "text-2xl" : "text-sm"}`}>
      {chips.map((c) => (
        <span key={c} className="rounded-full bg-gold-soft px-3 py-1 font-semibold text-[#7a5410] animate-pop-in">
          {c}
        </span>
      ))}
    </div>
  );
}

export function AwardsList({ live, size = "phone" }: { live: PublicLiveState; size?: "phone" | "tv" }) {
  const awards = computeAwards(live);
  const tv = size === "tv";
  if (awards.length === 0) return <p className="text-center text-muted">No awards yet. Vote on some gifts!</p>;
  return (
    <ul className={`grid gap-3 ${tv ? "grid-cols-3 gap-6" : ""}`}>
      {awards.map((a, i) => (
        <li
          key={a.id}
          className={`rounded-3xl bg-white p-4 text-center shadow-sm ring-1 ring-gold/40 animate-pop-in ${tv ? "p-8" : ""}`}
          style={{ animationDelay: `${i * 180}ms` }}
        >
          <p className={tv ? "text-7xl" : "text-4xl"} aria-hidden>
            {a.emoji}
          </p>
          <p className={`mt-1 font-bold uppercase tracking-widest text-berry ${tv ? "text-xl" : "text-xs"}`}>{a.title}</p>
          <p className={`font-display font-extrabold text-pine-deep ${tv ? "text-4xl" : "text-2xl"}`}>{a.winners.map((id) => playerName(live, id)).join(" & ")}</p>
          <p className={`text-muted ${tv ? "text-xl" : "text-sm"}`}>{a.detail}</p>
        </li>
      ))}
    </ul>
  );
}
