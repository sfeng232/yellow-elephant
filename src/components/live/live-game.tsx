"use client";

import { useEffect, useState } from "react";
import { RuleList } from "@/components/challenge-card";
import { Button, Card, ErrorNote, Page } from "@/components/ui";
import { api } from "@/lib/client/api";
import { giftHeldBy, playerName, stealBlock, stealableGifts, unopenedBringers } from "@/lib/game/engine";
import type { ClientAction, GameEvent, GameView, Gift, PublicLiveState, Vote } from "@/lib/types";
import { describeEvent, giftLabel } from "./describe";
import { GiftRow, StealMeter, VoteButtons } from "./gift-parts";

type Mode = "player" | "host";

/**
 * The live exchange. Players see their own turn controls; the host sees the same
 * board plus "act for <player>", undo and end-game controls.
 */
export function LiveGame({ game, mode, refresh }: { game: GameView; mode: Mode; refresh: () => Promise<void> }) {
  const live = game.live!;
  const myId = game.me?.id ?? null;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: ClientAction): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      await api.act(game.code, action);
      await refresh();
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work");
      await refresh();
      return false;
    } finally {
      setBusy(false);
    }
  }
  const vote = (giftId: string) => (v: Vote | null) => void act({ type: "vote", giftId, vote: v });

  if (live.phase === "ended") return <FinalBoard game={game} live={live} myId={myId} onVote={vote} mode={mode} act={act} />;

  const actorName = playerName(live, live.actor);
  const myTurn = live.actor !== null && live.actor === myId;
  const canControl = myTurn || (mode === "host" && live.actor !== null);
  const myGift = myId ? giftHeldBy(live, myId) : null;

  return (
    <Page>
      <EventOverlay live={live} myId={myId} onVote={vote} busy={busy} />

      <header className="mb-4 flex items-center justify-between text-sm">
        <span className="font-semibold text-muted">
          Game {game.code} · Gift {Math.min(live.gifts.length + 1, live.players.length)} of {live.players.length}
        </span>
        <span className="rounded-full bg-white px-3 py-1 font-semibold ring-1 ring-ink/10">🔒 after {game.settings.maxStealsPerGift}</span>
      </header>

      <TurnBanner live={live} myTurn={myTurn} actorName={actorName} />

      {canControl && (
        <Card className="mt-4 animate-pop-in">
          {!myTurn && <p className="mb-3 rounded-xl bg-gold-soft px-3 py-2 text-sm font-medium">Host mode: acting for {actorName}</p>}
          {live.phase === "turns" ? (
            // Keyed so the panel resets whenever the move passes to someone else.
            <TurnControls key={`${live.actor}-${live.seq}`} game={game} live={live} actor={live.actor!} act={act} busy={busy} />
          ) : (
            <FinalSwapControls game={game} live={live} actor={live.actor!} act={act} busy={busy} />
          )}
        </Card>
      )}
      <div className="mt-3">
        <ErrorNote>{error}</ErrorNote>
      </div>

      {mode === "player" && myGift && (
        <Card className="mt-4 bg-gradient-to-br from-gold-soft to-white">
          <p className="text-xs font-bold uppercase tracking-widest text-[#7a5410]">You&apos;re holding</p>
          <p className="font-display text-2xl font-semibold">{myGift.label}</p>
          <div className="mt-1 flex items-center gap-2 text-sm text-muted">
            from {playerName(live, myGift.broughtBy)} <StealMeter gift={myGift} max={game.settings.maxStealsPerGift} />
          </div>
        </Card>
      )}

      <TurnOrder live={live} />

      <Card className="mt-4">
        <h2 className="mb-3 font-display text-xl font-semibold">
          Opened gifts <span className="text-base text-muted">({live.gifts.length})</span>
        </h2>
        {live.gifts.length === 0 ? (
          <p className="rounded-2xl bg-cream p-4 text-center text-sm text-muted">No gifts opened yet. The suspense! 🎁</p>
        ) : (
          <ul className="space-y-2.5">
            {[...live.gifts].reverse().map((g) => (
              <GiftRow key={g.id} state={live} gift={g} max={game.settings.maxStealsPerGift} myId={myId} onVote={vote(g.id)} highlight={g.holder === myId} />
            ))}
          </ul>
        )}
      </Card>

      <EventFeed live={live} />

      {mode === "player" && game.me && <MyChallenge game={game} />}
      {mode === "host" && <HostBar live={live} act={act} busy={busy} />}
    </Page>
  );
}

// ---------- Turn banner ----------

function TurnBanner({ live, myTurn, actorName }: { live: PublicLiveState; myTurn: boolean; actorName: string }) {
  const lastSteal = live.events.at(-1)?.kind === "steal" ? live.events.at(-1) : null;
  const stolenFromActor = lastSteal && lastSteal.from === live.actor;
  const finale = live.phase === "finalSwap";

  return (
    <div
      key={`${live.actor}-${live.seq}`}
      className={`rounded-3xl p-5 text-center animate-slide-down ${myTurn ? "bg-berry text-white animate-glow" : "bg-pine text-white"}`}
    >
      <p className="text-sm font-semibold uppercase tracking-widest opacity-80">
        {finale ? "Final swap" : stolenFromActor ? "Stolen!" : `Turn ${live.turnIndex + 1}`}
      </p>
      <p className="mt-1 font-display text-3xl font-extrabold">{myTurn ? "Your move! 🎉" : `${actorName}'s move`}</p>
      <p className="mt-1 text-sm opacity-90">
        {finale
          ? `${myTurn ? "You" : actorName} went first, so ${myTurn ? "you" : "they"} may swap with anyone, or keep.`
          : stolenFromActor
            ? `${playerName(live, lastSteal.by)} took “${giftLabel(live, lastSteal.giftId)}”. Open a new gift or steal another.`
            : "Open a new gift or steal one that's already open."}
      </p>
    </div>
  );
}

// ---------- Controls ----------

function TurnControls({ game, live, actor, act, busy }: { game: GameView; live: PublicLiveState; actor: string; act: (a: ClientAction) => Promise<boolean>; busy: boolean }) {
  const [panel, setPanel] = useState<"choose" | "open" | "steal">("choose");
  const settings = game.settings;
  const stealable = stealableGifts(live, actor, settings);

  if (panel === "open") return <OpenForm live={live} actor={actor} act={act} busy={busy} onCancel={() => setPanel("choose")} />;
  if (panel === "steal") {
    return (
      <div className="animate-pop-in">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-xl font-semibold">Steal which gift?</h3>
          <button className="text-sm font-semibold text-muted" onClick={() => setPanel("choose")}>
            Back
          </button>
        </div>
        <ul className="space-y-2">
          {live.gifts.map((g) => {
            const block = stealBlock(live, g, actor, settings);
            return (
              <li key={g.id}>
                <button
                  disabled={busy || block !== null}
                  onClick={() => act({ type: "steal", giftId: g.id })}
                  className="flex w-full items-center justify-between gap-3 rounded-2xl bg-cream p-3 text-left transition-all hover:bg-gold-soft active:scale-[0.98] disabled:opacity-50 disabled:hover:bg-cream"
                >
                  <span className="min-w-0">
                    <span className="block font-semibold">{g.label}</span>
                    <span className="block text-sm text-muted">
                      {block === "noStealBack" ? "Just taken from you, no steal-backs" : `from ${playerName(live, g.holder)}`}
                    </span>
                  </span>
                  <StealMeter gift={g} max={settings.maxStealsPerGift} />
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-3">
      <Button className="h-28 flex-col text-lg" onClick={() => setPanel("open")} disabled={busy}>
        <span className="text-3xl" aria-hidden>
          🎁
        </span>
        Open a gift
      </Button>
      <Button variant="gold" className="h-28 flex-col text-lg" onClick={() => setPanel("steal")} disabled={busy || stealable.length === 0}>
        <span className="text-3xl" aria-hidden>
          🦹
        </span>
        Steal
        {stealable.length === 0 && <span className="text-xs font-medium">nothing to steal</span>}
      </Button>
    </div>
  );
}

function OpenForm({ live, actor, act, busy, onCancel }: { live: PublicLiveState; actor: string; act: (a: ClientAction) => Promise<boolean>; busy: boolean; onCancel: () => void }) {
  const bringers = unopenedBringers(live);
  const others = bringers.filter((p) => p.id !== actor);
  const options = others.length > 0 ? others : bringers;
  const [label, setLabel] = useState("");
  const [broughtBy, setBroughtBy] = useState(options.length === 1 ? options[0].id : "");
  const ownLeft = bringers.some((p) => p.id === actor);

  return (
    <form
      className="space-y-3 animate-pop-in"
      onSubmit={async (e) => {
        e.preventDefault();
        await act({ type: "open", label, broughtBy });
      }}
    >
      <div className="flex items-center justify-between">
        <h3 className="font-display text-xl font-semibold">Unwrap it! 🎀</h3>
        <button type="button" className="text-sm font-semibold text-muted" onClick={onCancel}>
          Back
        </button>
      </div>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-muted">What is it?</span>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Pickle-shaped night light"
          maxLength={60}
          autoFocus
          className="w-full rounded-2xl bg-cream px-4 py-3 text-lg outline-none ring-pine/40 focus:ring-2"
        />
      </label>
      <label className="block">
        <span className="mb-1 block text-sm font-semibold text-muted">Who brought it?</span>
        <select
          value={broughtBy}
          onChange={(e) => setBroughtBy(e.target.value)}
          className="w-full rounded-2xl bg-cream px-4 py-3 text-lg outline-none ring-pine/40 focus:ring-2"
        >
          <option value="" disabled>
            Pick a name…
          </option>
          {options.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.id === actor ? " (yourself!)" : ""}
            </option>
          ))}
        </select>
        {ownLeft && others.length > 0 && <span className="mt-1 block text-xs text-muted">Your own gift isn&apos;t listed. Pick a different one from the pile!</span>}
      </label>
      <Button type="submit" className="w-full text-lg" disabled={busy || !label.trim() || !broughtBy}>
        {busy ? "Revealing…" : "Reveal the challenge ✨"}
      </Button>
    </form>
  );
}

function FinalSwapControls({ game, live, actor, act, busy }: { game: GameView; live: PublicLiveState; actor: string; act: (a: ClientAction) => Promise<boolean>; busy: boolean }) {
  const options = stealableGifts(live, actor, game.settings);
  return (
    <div className="space-y-2">
      <h3 className="font-display text-xl font-semibold">Swap or keep?</h3>
      <ul className="space-y-2">
        {options.map((g) => (
          <li key={g.id}>
            <button
              disabled={busy}
              onClick={() => act({ type: "finalSwap", giftId: g.id })}
              className="flex w-full items-center justify-between rounded-2xl bg-cream p-3 text-left hover:bg-gold-soft active:scale-[0.98]"
            >
              <span>
                <span className="block font-semibold">{g.label}</span>
                <span className="block text-sm text-muted">held by {playerName(live, g.holder)}</span>
              </span>
              <span aria-hidden>🔄</span>
            </button>
          </li>
        ))}
      </ul>
      <Button variant="ghost" className="w-full" disabled={busy} onClick={() => act({ type: "finalSwap", giftId: null })}>
        Keep “{giftHeldBy(live, actor)?.label}”
      </Button>
    </div>
  );
}

// ---------- Info panels ----------

function TurnOrder({ live }: { live: PublicLiveState }) {
  return (
    <div className="mt-4 -mx-4 overflow-x-auto px-4 pb-1">
      <ol className="flex gap-2">
        {live.turnOrder.map((id, i) => {
          const done = i < live.turnIndex || live.phase !== "turns";
          const current = i === live.turnIndex && live.phase === "turns";
          return (
            <li
              key={id}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold transition-all ${
                current ? "bg-gold text-ink scale-105 shadow" : done ? "bg-white/70 text-muted line-through decoration-ink/20" : "bg-white text-ink ring-1 ring-ink/10"
              } ${live.actor === id && !current ? "ring-2 ring-berry" : ""}`}
            >
              {i + 1}. {playerName(live, id)}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function EventFeed({ live }: { live: PublicLiveState }) {
  const recent = live.events.slice(-6).reverse();
  return (
    <Card className="mt-4">
      <h2 className="mb-2 font-display text-lg font-semibold">What just happened</h2>
      <ul className="space-y-1.5 text-sm">
        {recent.map((e) => {
          const d = describeEvent(live, e);
          return (
            <li key={e.seq} className="flex gap-2 animate-float-up">
              <span aria-hidden>{d.emoji}</span>
              <span>{d.text}</span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function MyChallenge({ game }: { game: GameView }) {
  return (
    <details className="mt-4 rounded-3xl bg-white/85 p-5 ring-1 ring-ink/5">
      <summary className="cursor-pointer font-display text-lg font-semibold">🤫 My challenge</summary>
      <div className="mt-3">
        <RuleList challenge={game.me!.challenge} />
      </div>
    </details>
  );
}

function HostBar({ live, act, busy }: { live: PublicLiveState; act: (a: ClientAction) => Promise<boolean>; busy: boolean }) {
  return (
    <Card className="mt-4">
      <h2 className="mb-3 font-display text-lg font-semibold">Host controls</h2>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="ghost" disabled={busy || !live.canUndo} onClick={() => act({ type: "undo" })}>
          ↩️ Undo last move
        </Button>
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() => {
            if (confirm("End the game now? Everyone keeps what they're holding.")) void act({ type: "end" });
          }}
        >
          🏁 End game
        </Button>
      </div>
    </Card>
  );
}

// ---------- Reveal and steal overlays ----------

const SHOWN: GameEvent["kind"][] = ["open", "steal", "swap", "undo"];

/** Pops up the challenge reveal when a gift is opened, and a toast for steals. */
function EventOverlay({ live, myId, onVote, busy }: { live: PublicLiveState; myId: string | null; onVote: (giftId: string) => (v: Vote | null) => void; busy: boolean }) {
  // Start from "now", so joining or reloading mid-game doesn't replay old events.
  const [seen, setSeen] = useState(live.seq);
  const next = live.events.find((e) => e.seq > seen && SHOWN.includes(e.kind));
  const gift = next?.giftId ? live.gifts.find((g) => g.id === next.giftId) : undefined;
  const isReveal = next?.kind === "open" && gift;

  // Toasts close themselves; reveals wait for a tap.
  const toastSeq = next && !isReveal ? next.seq : null;
  useEffect(() => {
    if (toastSeq === null) return;
    const t = setTimeout(() => setSeen(toastSeq), 3200);
    return () => clearTimeout(t);
  }, [toastSeq]);

  if (!next) return null;
  if (isReveal) return <RevealModal live={live} gift={gift} myId={myId} onVote={onVote(gift.id)} busy={busy} onClose={() => setSeen(next.seq)} />;

  const d = describeEvent(live, next);
  return (
    <div className="fixed inset-x-0 top-3 z-40 flex justify-center px-4" role="status">
      <button
        onClick={() => setSeen(next.seq)}
        className={`flex max-w-md items-center gap-3 rounded-2xl px-4 py-3 text-left font-semibold text-white shadow-xl animate-slide-down ${next.kind === "steal" ? "bg-berry" : "bg-pine"}`}
      >
        <span className="text-3xl animate-swoosh" aria-hidden>
          {d.emoji}
        </span>
        <span>{d.text}</span>
      </button>
    </div>
  );
}

function RevealModal({ live, gift, myId, onVote, busy, onClose }: { live: PublicLiveState; gift: Gift; myId: string | null; onVote: (v: Vote | null) => void; busy: boolean; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-3 backdrop-blur-sm sm:items-center" role="dialog" aria-modal aria-labelledby="reveal-title">
      <div className="w-full max-w-md rounded-3xl bg-snow p-5 shadow-2xl animate-pop-in">
        <p className="text-center text-sm font-semibold uppercase tracking-widest text-berry">{playerName(live, gift.holder)} opened…</p>
        <h2 id="reveal-title" className="mt-1 text-center font-display text-3xl font-extrabold text-pine-deep">
          <span className="mr-2 inline-block animate-wiggle" aria-hidden>
            🎁
          </span>
          {gift.label}
        </h2>
        <p className="mt-4 mb-2 text-sm font-semibold text-muted">{playerName(live, gift.broughtBy)}&apos;s secret challenge was:</p>
        <RuleList challenge={gift.challenge} animate />
        <p className="mt-5 mb-2 text-center font-semibold">Did they follow it?</p>
        <div className="flex justify-center">
          <VoteButtons gift={gift} myId={myId} onVote={onVote} busy={busy} size="lg" />
        </div>
        <Button variant="secondary" className="mt-5 w-full" onClick={onClose}>
          Continue
        </Button>
      </div>
    </div>
  );
}

// ---------- End ----------

function FinalBoard({
  game,
  live,
  myId,
  onVote,
  mode,
  act,
}: {
  game: GameView;
  live: PublicLiveState;
  myId: string | null;
  onVote: (giftId: string) => (v: Vote | null) => void;
  mode: Mode;
  act: (a: ClientAction) => Promise<boolean>;
}) {
  const mine = myId ? giftHeldBy(live, myId) : null;
  return (
    <Page>
      <div className="mb-5 text-center animate-pop-in">
        <p className="text-6xl" aria-hidden>
          🏁🎄
        </p>
        <h1 className="mt-2 font-display text-4xl font-extrabold text-pine-deep">That&apos;s a wrap!</h1>
        {mine && (
          <p className="mt-2 text-muted">
            You&apos;re going home with <span className="font-semibold text-ink">{mine.label}</span>.
          </p>
        )}
      </div>
      <Card>
        <h2 className="mb-3 font-display text-xl font-semibold">Who got what</h2>
        <ul className="space-y-2.5">
          {live.players.map((p) => {
            const g = giftHeldBy(live, p.id);
            return g ? (
              <GiftRow key={p.id} state={live} gift={g} max={game.settings.maxStealsPerGift} myId={myId} onVote={onVote(g.id)} highlight={p.id === myId} />
            ) : (
              <li key={p.id} className="rounded-2xl bg-cream p-3.5 text-muted">
                {p.name}: no gift (the game ended early)
              </li>
            );
          })}
        </ul>
      </Card>
      <p className="mt-4 text-center text-sm text-muted">Awards are coming in Phase 3. Keep voting on challenges in the meantime!</p>
      {mode === "host" && live.canUndo && (
        <Button variant="ghost" className="mt-4 w-full" onClick={() => act({ type: "undo" })}>
          ↩️ Undo the ending
        </Button>
      )}
    </Page>
  );
}
