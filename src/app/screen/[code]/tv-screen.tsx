"use client";

import { use, useEffect, useState } from "react";
import { RuleList } from "@/components/challenge-card";
import { GameGate } from "@/components/game-gate";
import { describeEvent } from "@/components/live/describe";
import { StealMeter } from "@/components/live/gift-parts";
import { ActiveEffects, AwardsList, TwistCard } from "@/components/live/twist-parts";
import { giftHeldBy, playerName, voteSummary } from "@/lib/game/engine";
import { useGame } from "@/lib/client/use-game";
import { useJoinUrl } from "@/lib/client/use-join-url";
import type { GameEvent, GameView, Gift, PublicLiveState } from "@/lib/types";

/**
 * Big-screen mode for a TV or laptop. Read-only: shows only public info (never anyone's
 * secret challenge until their gift is opened), and announcements close on their own.
 */
export function TvScreen({ params }: { params: Promise<{ code: string }> }) {
  const code = use(params).code.toUpperCase();
  const { game, error } = useGame(code);
  return (
    <div className="flex min-h-screen flex-col bg-pine-deep bg-[radial-gradient(circle_at_20%_10%,rgb(192_40_59/0.35),transparent_45%),radial-gradient(circle_at_80%_90%,rgb(217_164_59/0.25),transparent_45%)] text-white">
      <GameGate game={game} error={error}>
        {(g) => (!g.live ? <TvLobby game={g} /> : g.live.phase === "ended" ? <TvEnd game={g} live={g.live} /> : <TvLive game={g} live={g.live} />)}
      </GameGate>
    </div>
  );
}

function TvLobby({ game }: { game: GameView }) {
  const { url, qr } = useJoinUrl(game.code, 640);
  return (
    <main className="grid flex-1 grid-cols-[minmax(0,5fr)_minmax(0,4fr)] items-center gap-16 p-16">
      <section className="text-center">
        <h1 className="font-display text-7xl font-extrabold">
          <span className="mr-4 inline-block animate-wiggle" aria-hidden>
            🐘
          </span>
          White Elephant
        </h1>
        <p className="mt-6 text-3xl text-white/80">Scan to join, or enter the code</p>
        <p className="mt-2 font-display text-[10rem] font-extrabold leading-none tracking-[0.15em] text-gold">{game.code}</p>
        {url && <p className="mt-4 text-2xl text-white/60">{url.replace(/^https?:\/\//, "")}</p>}
      </section>
      <section className="flex flex-col items-center gap-8">
        {qr && (
          // eslint-disable-next-line @next/next/no-img-element -- data URL
          <img src={qr} alt={`QR code to join game ${game.code}`} className="w-full max-w-md rounded-[2rem] bg-white p-4 shadow-2xl animate-pop-in" />
        )}
        <div className="w-full">
          <p className="mb-3 text-center text-2xl font-semibold text-white/80">{game.players.length} joined</p>
          <ul className="flex flex-wrap justify-center gap-3">
            {game.players.map((p) => (
              <li key={p.id} className="rounded-full bg-white/10 px-5 py-2 text-2xl font-semibold animate-pop-in">
                {p.name}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </main>
  );
}

function TvLive({ game, live }: { game: GameView; live: PublicLiveState }) {
  const max = game.settings.maxStealsPerGift;
  const actor = playerName(live, live.actor);
  const label = live.phase === "finalSwap" ? "Final swap" : live.phase === "bonusSwap" ? "Bonus swap" : `Turn ${live.turnIndex + 1} of ${live.turnOrder.length}`;
  const lastEvent = live.events.findLast((e) => e.kind !== "twist");

  return (
    <main className="flex flex-1 flex-col gap-8 p-12">
      <TvOverlay live={live} />
      <header className="flex items-center justify-between text-2xl font-semibold text-white/70">
        <span>🐘 White Elephant · {game.code}</span>
        <span>
          {live.gifts.length}/{live.players.length} opened · 🔒 after {max} steals
        </span>
      </header>

      <section key={`${live.actor}-${live.phase}`} className="text-center animate-slide-down">
        <p className="text-3xl font-bold uppercase tracking-[0.3em] text-gold">{label}</p>
        <p className="mt-2 font-display text-8xl font-extrabold">{actor}&apos;s move</p>
        {lastEvent && lastEvent.kind !== "start" && <p className="mt-4 text-3xl text-white/75">{describeEvent(live, lastEvent).text}</p>}
        <div className="mt-6">
          <ActiveEffects live={live} size="tv" />
        </div>
      </section>

      <section className="flex-1">
        {live.gifts.length === 0 ? (
          <p className="mt-16 text-center text-4xl text-white/60">
            <span className="mr-3 inline-block animate-wiggle">🎁</span>No gifts opened yet…
          </p>
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(20rem,1fr))] gap-5">
            {live.gifts.map((g) => (
              <TvGift key={g.id} live={live} gift={g} max={max} />
            ))}
          </ul>
        )}
      </section>

      <footer>
        <ol className="flex flex-wrap justify-center gap-3">
          {live.turnOrder.map((id, i) => {
            const current = id === live.actor;
            const done = i < live.turnIndex;
            return (
              <li
                key={id}
                className={`rounded-full px-5 py-2 text-2xl font-semibold transition-all ${current ? "scale-110 bg-gold text-ink shadow-lg" : done ? "bg-white/5 text-white/40" : "bg-white/10"}`}
              >
                {playerName(live, id)}
              </li>
            );
          })}
        </ol>
      </footer>
    </main>
  );
}

function TvGift({ live, gift, max }: { live: PublicLiveState; gift: Gift; max: number }) {
  const v = voteSummary(gift);
  return (
    <li key={`${gift.id}-${gift.holder}`} className="rounded-3xl bg-snow p-5 text-ink shadow-xl animate-pop-in">
      <div className="flex items-start justify-between gap-3">
        <p className="font-display text-3xl font-semibold leading-tight">{gift.label}</p>
        <StealMeter gift={gift} max={max} />
      </div>
      <p className="mt-2 text-xl text-muted">
        🙌 <span className="font-semibold text-ink">{playerName(live, gift.holder)}</span>
      </p>
      <p className="mt-1 flex items-center gap-3 text-xl">
        <span>👍 {v.up}</span>
        <span>👎 {v.down}</span>
        {v.ruleBreaker && <span className="rounded-full bg-berry/10 px-3 py-0.5 text-base font-bold text-berry-deep">🚨 Rule breaker</span>}
      </p>
    </li>
  );
}

const TV_SHOWN: GameEvent["kind"][] = ["open", "steal", "swap", "twist", "undo"];
const TV_DURATION: Partial<Record<GameEvent["kind"], number>> = { open: 12000, twist: 8000 };

/** Full-screen announcements, one at a time, each closing on its own. */
function TvOverlay({ live }: { live: PublicLiveState }) {
  const [seen, setSeen] = useState(live.seq);
  const next = live.events.find((e) => e.seq > seen && TV_SHOWN.includes(e.kind));
  const nextSeq = next?.seq ?? null;
  const duration = next ? (TV_DURATION[next.kind] ?? 4000) : 0;

  useEffect(() => {
    if (nextSeq === null) return;
    const t = setTimeout(() => setSeen(nextSeq), duration);
    return () => clearTimeout(t);
  }, [nextSeq, duration]);

  if (!next) return null;
  const gift = next.giftId ? live.gifts.find((g) => g.id === next.giftId) : undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/70 p-16 backdrop-blur" onClick={() => setSeen(next.seq)}>
      {next.kind === "twist" ? (
        <div className="w-full max-w-5xl">
          <TwistCard event={next} size="tv" />
        </div>
      ) : next.kind === "open" && gift ? (
        <TvReveal live={live} gift={gift} />
      ) : (
        <div className={`flex items-center gap-8 rounded-[2rem] px-16 py-12 text-5xl font-display font-extrabold shadow-2xl animate-pop-in ${next.kind === "steal" ? "bg-berry" : "bg-pine"}`}>
          <span className="text-[7rem] animate-swoosh" aria-hidden>
            {describeEvent(live, next).emoji}
          </span>
          <span className="max-w-4xl">{describeEvent(live, next).text}</span>
        </div>
      )}
    </div>
  );
}

function TvReveal({ live, gift }: { live: PublicLiveState; gift: Gift }) {
  const v = voteSummary(gift);
  return (
    <div className="w-full max-w-5xl rounded-[2rem] bg-snow p-12 text-ink shadow-2xl animate-pop-in">
      <p className="text-center text-3xl font-bold uppercase tracking-[0.25em] text-berry">{playerName(live, gift.holder)} opened…</p>
      <h2 className="mt-3 text-center font-display text-7xl font-extrabold text-pine-deep">
        <span className="mr-4 inline-block animate-wiggle">🎁</span>
        {gift.label}
      </h2>
      <p className="mb-4 mt-8 text-3xl font-semibold text-muted">{playerName(live, gift.broughtBy)}&apos;s secret challenge was:</p>
      <div className="text-2xl [&_p]:text-4xl">
        <RuleList challenge={gift.challenge} animate />
      </div>
      <p className="mt-8 text-center text-4xl font-semibold">
        Did they follow it? Vote on your phone! <span className="ml-4">👍 {v.up}</span> <span className="ml-3">👎 {v.down}</span>
      </p>
    </div>
  );
}

function TvEnd({ game, live }: { game: GameView; live: PublicLiveState }) {
  return (
    <main className="flex flex-1 flex-col gap-10 p-14">
      <h1 className="text-center font-display text-8xl font-extrabold animate-pop-in">
        <span className="mr-4 inline-block animate-wiggle">🏆</span>
        The awards
      </h1>
      <AwardsList live={live} size="tv" />
      <section>
        <h2 className="mb-4 text-center font-display text-4xl font-semibold text-white/80">Who&apos;s taking what home</h2>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-4">
          {live.players.map((p) => {
            const g = giftHeldBy(live, p.id);
            return (
              <li key={p.id} className="rounded-3xl bg-white/10 p-5 animate-pop-in">
                <p className="text-2xl font-semibold text-gold">{p.name}</p>
                <p className="font-display text-3xl font-semibold">{g ? g.label : "—"}</p>
                {g && <p className="text-lg text-white/60">brought by {playerName(live, g.broughtBy)}</p>}
              </li>
            );
          })}
        </ul>
      </section>
      <p className="text-center text-xl text-white/50">Game {game.code} · Keep voting for 🎨 Most Creative on your phones!</p>
    </main>
  );
}
