"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { RuleList } from "@/components/challenge-card";
import { Button, Card, ErrorNote, Page } from "@/components/ui";
import { api } from "@/lib/client/api";
import { canOpen, giftHeldBy, playerName, stealBlock, stealableGifts, unopenedBringers, type StealBlock } from "@/lib/game/engine";
import { seededRng, shuffle } from "@/lib/random";
import type { ClientAction, GameEvent, GameView, Gift, PublicLiveState, Vote } from "@/lib/types";
import { describeEvent, giftLabel } from "./describe";
import { GiftRow, StealMeter, VoteButtons } from "./gift-parts";
import { ActiveEffects, AwardsList, TwistCard } from "./twist-parts";

type Mode = "player" | "host";
type Act = (a: ClientAction) => Promise<boolean>;

const BLOCK_TEXT: Record<Exclude<StealBlock, null>, string> = {
  own: "That's yours",
  locked: "Locked",
  noStealBack: "Just taken from you, no steal-backs",
  frozen: "Steal freeze!",
  mustOpen: "Fresh gifts only this move",
};

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

  if (live.phase === "ended") return <FinalBoard game={game} live={live} myId={myId} onVote={vote} mode={mode} act={act} busy={busy} error={error} />;

  const actorName = playerName(live, live.actor);
  const myTurn = live.actor !== null && live.actor === myId;
  const canControl = myTurn || (mode === "host" && live.actor !== null);
  const myGift = myId ? giftHeldBy(live, myId) : null;
  const swapping = live.phase === "bonusSwap" || live.phase === "finalSwap";

  return (
    <Page>
      <EventOverlay live={live} myId={myId} onVote={vote} busy={busy} />

      <header className="mb-4 flex items-center justify-between text-sm">
        <span className="font-semibold text-muted">
          Game {game.code} · {live.gifts.length}/{live.players.length} opened
        </span>
        <span className="rounded-full bg-white px-3 py-1 font-semibold ring-1 ring-ink/10">🔒 after {game.settings.maxStealsPerGift}</span>
      </header>

      <TurnBanner live={live} myTurn={myTurn} actorName={actorName} />
      <div className="mt-3">
        <ActiveEffects live={live} />
      </div>

      {canControl && (
        <Card className="mt-4 animate-pop-in">
          {!myTurn && <p className="mb-3 rounded-xl bg-gold-soft px-3 py-2 text-sm font-medium">Host mode: acting for {actorName}</p>}
          {swapping ? (
            <SwapControls key={live.seq} game={game} live={live} actor={live.actor!} act={act} busy={busy} />
          ) : (
            // Keyed so the panel resets whenever the move passes to someone else.
            <TurnControls key={`${live.actor}-${live.seq}`} game={game} live={live} actor={live.actor!} act={act} busy={busy} />
          )}
        </Card>
      )}
      <div className="mt-3">
        <ErrorNote>{error}</ErrorNote>
      </div>

      {mode === "player" && myGift && (
        <Card className="mt-4 bg-gradient-to-br from-gold-soft to-white">
          <p className="text-xs font-bold uppercase tracking-widest text-[#7a5410]">You&apos;re holding</p>
          <p key={myGift.id} className="font-display text-2xl font-semibold animate-swoosh">
            {myGift.label}
          </p>
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
      {mode === "host" && <HostBar code={game.code} live={live} act={act} busy={busy} />}
    </Page>
  );
}

// ---------- Turn banner ----------

function TurnBanner({ live, myTurn, actorName }: { live: PublicLiveState; myTurn: boolean; actorName: string }) {
  const last = live.events.findLast((e) => e.kind !== "twist" && e.kind !== "undo");
  const stolenFromActor = last?.kind === "steal" && last.from === live.actor ? last : null;
  const you = myTurn ? "You" : actorName;

  let label = `Turn ${live.turnIndex + 1}`;
  let hint = "Open a new gift or steal one that's already open.";
  if (live.phase === "finalSwap") {
    label = "Final swap";
    hint = `${you} went first, so ${myTurn ? "you" : "they"} may swap with anyone, or keep.`;
  } else if (live.phase === "bonusSwap") {
    label = "Bonus swap";
    hint = `A twist lets ${myTurn ? "you" : actorName} swap with anyone, or keep.`;
  } else if (stolenFromActor) {
    label = "Stolen!";
    hint = `${playerName(live, stolenFromActor.by)} took “${giftLabel(live, stolenFromActor.giftId)}”. Open a new gift or steal another.`;
  }

  return (
    <div
      key={`${live.actor}-${live.phase}`}
      className={`rounded-3xl p-5 text-center animate-slide-down ${myTurn ? "bg-berry text-white animate-glow" : "bg-pine text-white"}`}
    >
      <p className="text-sm font-semibold uppercase tracking-widest opacity-80">{label}</p>
      <p className="mt-1 font-display text-3xl font-extrabold">{myTurn ? "Your move! 🎉" : `${actorName}'s move`}</p>
      <p className="mt-1 text-sm opacity-90">{hint}</p>
    </div>
  );
}

// ---------- Controls ----------

function TurnControls({ game, live, actor, act, busy }: { game: GameView; live: PublicLiveState; actor: string; act: Act; busy: boolean }) {
  const [panel, setPanel] = useState<"choose" | "open" | "steal">("choose");
  const settings = game.settings;
  const stealable = stealableGifts(live, actor, settings);
  const openOk = canOpen(live, actor, settings);

  if (panel === "open") return <OpenForm live={live} actor={actor} act={act} busy={busy} onCancel={() => setPanel("choose")} />;
  if (live.modifiers?.blindPick) return <MysteryPick live={live} actor={actor} act={act} busy={busy} openOk={openOk} onOpen={() => setPanel("open")} game={game} />;

  if (panel === "steal") {
    return (
      <div className="animate-pop-in">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-display text-xl font-semibold">Steal which gift?</h3>
          {openOk && (
            <button className="text-sm font-semibold text-muted" onClick={() => setPanel("choose")}>
              Back
            </button>
          )}
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
                    <span className="block text-sm text-muted">{block && block !== "locked" ? BLOCK_TEXT[block] : `from ${playerName(live, g.holder)}`}</span>
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
      <Button className="h-28 flex-col text-lg" onClick={() => setPanel("open")} disabled={busy || !openOk}>
        <span className="text-3xl" aria-hidden>
          🎁
        </span>
        Open a gift
        {!openOk && <span className="text-xs font-medium">Heist: must steal!</span>}
      </Button>
      <Button variant="gold" className="h-28 flex-col text-lg" onClick={() => setPanel("steal")} disabled={busy || stealable.length === 0}>
        <span className="text-3xl" aria-hidden>
          🦹
        </span>
        Steal
        {stealable.length === 0 && <span className="text-xs font-medium">{(live.stealLockTurns ?? 0) > 0 ? "steal freeze" : live.modifiers?.mustOpen ? "fresh gifts only" : "nothing to steal"}</span>}
      </Button>
    </div>
  );
}

/** "Mystery pick" twist: face-down cards for every option, shuffled. */
function MysteryPick({ game, live, actor, act, busy, openOk, onOpen }: { game: GameView; live: PublicLiveState; actor: string; act: Act; busy: boolean; openOk: boolean; onOpen: () => void }) {
  const stealable = stealableGifts(live, actor, game.settings);
  const cards = useMemo(() => {
    const options: ({ kind: "pile" } | { kind: "gift"; gift: Gift })[] = stealable.map((gift) => ({ kind: "gift" as const, gift }));
    if (openOk) options.push({ kind: "pile" });
    return shuffle(options, seededRng(live.seq));
  }, [stealable, openOk, live.seq]);
  const [flipped, setFlipped] = useState<number | null>(null);

  async function choose(i: number) {
    setFlipped(i);
    await new Promise((r) => setTimeout(r, 900));
    const c = cards[i];
    if (c.kind === "pile") onOpen();
    else await act({ type: "steal", giftId: c.gift.id });
  }

  return (
    <div className="animate-pop-in">
      <h3 className="font-display text-xl font-semibold">🙈 Mystery pick!</h3>
      <p className="mb-3 text-sm text-muted">Pick a card. It might be a new gift from the pile, or a steal.</p>
      <div className="grid grid-cols-3 gap-2">
        {cards.map((c, i) => (
          <button key={i} disabled={busy || flipped !== null} onClick={() => choose(i)} className="flip aspect-[3/4]">
            <div className={`flip-inner grid h-full ${flipped === i ? "is-flipped" : ""}`}>
              <span className="flip-face candy-stripes col-start-1 row-start-1 flex items-center justify-center rounded-2xl text-3xl text-white shadow">?</span>
              <span className="flip-face flip-back col-start-1 row-start-1 flex items-center justify-center rounded-2xl bg-cream p-2 text-center text-sm font-semibold shadow">
                {c.kind === "pile" ? "🎁 A new gift!" : `🦹 ${c.gift.label}`}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function OpenForm({ live, actor, act, busy, onCancel }: { live: PublicLiveState; actor: string; act: Act; busy: boolean; onCancel: () => void }) {
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
        <select value={broughtBy} onChange={(e) => setBroughtBy(e.target.value)} className="w-full rounded-2xl bg-cream px-4 py-3 text-lg outline-none ring-pine/40 focus:ring-2">
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

function SwapControls({ game, live, actor, act, busy }: { game: GameView; live: PublicLiveState; actor: string; act: Act; busy: boolean }) {
  const options = stealableGifts(live, actor, game.settings);
  return (
    <div className="space-y-2">
      <h3 className="font-display text-xl font-semibold">Swap or keep?</h3>
      <ul className="space-y-2">
        {options.map((g) => (
          <li key={g.id}>
            <button
              disabled={busy}
              onClick={() => act({ type: "swap", giftId: g.id })}
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
      <Button variant="ghost" className="w-full" disabled={busy} onClick={() => act({ type: "swap", giftId: null })}>
        Keep “{giftHeldBy(live, actor)?.label}”
      </Button>
    </div>
  );
}

// ---------- Info panels ----------

function TurnOrder({ live }: { live: PublicLiveState }) {
  return (
    <div className="-mx-4 mt-4 overflow-x-auto px-4 pb-1">
      <ol className="flex gap-2">
        {live.turnOrder.map((id, i) => {
          const done = i < live.turnIndex || live.phase === "finalSwap";
          const current = i === live.turnIndex && live.phase !== "finalSwap";
          return (
            <li
              key={id}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold transition-all ${
                current ? "scale-105 bg-gold text-ink shadow" : done ? "bg-white/70 text-muted line-through decoration-ink/20" : "bg-white text-ink ring-1 ring-ink/10"
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

function HostBar({ code, live, act, busy }: { code: string; live: PublicLiveState; act: Act; busy: boolean }) {
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
      <Link href={`/screen/${code}`} target="_blank" className="mt-2 block rounded-2xl bg-pine/10 py-3 text-center font-semibold text-pine hover:bg-pine/15">
        📺 Open the TV screen
      </Link>
    </Card>
  );
}

// ---------- Reveal, twist and steal overlays ----------

const SHOWN: GameEvent["kind"][] = ["open", "steal", "swap", "undo", "twist"];

/** Pops up the challenge reveal for opens, the twist card for twists, and a toast for the rest. */
function EventOverlay({ live, myId, onVote, busy }: { live: PublicLiveState; myId: string | null; onVote: (giftId: string) => (v: Vote | null) => void; busy: boolean }) {
  // Start from "now", so joining or reloading mid-game doesn't replay old events.
  const [seen, setSeen] = useState(live.seq);
  const next = live.events.find((e) => e.seq > seen && SHOWN.includes(e.kind));
  const gift = next?.kind === "open" && next.giftId ? live.gifts.find((g) => g.id === next.giftId) : undefined;

  // Toasts close themselves; reveals and twists wait for a tap (twists also time out).
  const autoClose = next && !gift ? (next.kind === "twist" ? 7000 : 3200) : null;
  const nextSeq = next?.seq ?? null;
  useEffect(() => {
    if (autoClose === null || nextSeq === null) return;
    const t = setTimeout(() => setSeen(nextSeq), autoClose);
    return () => clearTimeout(t);
  }, [autoClose, nextSeq]);

  if (!next) return null;
  const close = () => setSeen(next.seq);

  if (gift) return <RevealModal live={live} gift={gift} myId={myId} onVote={onVote(gift.id)} busy={busy} onClose={close} />;

  if (next.kind === "twist") {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 backdrop-blur-sm" role="dialog" aria-modal onClick={close}>
        <div className="w-full max-w-md">
          <TwistCard event={next} />
          <p className="mt-3 text-center text-sm font-semibold text-white/80">Tap to continue</p>
        </div>
      </div>
    );
  }

  const d = describeEvent(live, next);
  return (
    <div className="fixed inset-x-0 top-3 z-40 flex justify-center px-4" role="status">
      <button
        onClick={close}
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
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-3xl bg-snow p-5 shadow-2xl animate-pop-in">
        <p className="text-center text-sm font-semibold uppercase tracking-widest text-berry">{playerName(live, gift.holder)} opened…</p>
        <h2 id="reveal-title" className="mt-1 text-center font-display text-3xl font-extrabold text-pine-deep">
          <span className="mr-2 inline-block animate-wiggle" aria-hidden>
            🎁
          </span>
          {gift.label}
        </h2>
        <p className="mb-2 mt-4 text-sm font-semibold text-muted">{playerName(live, gift.broughtBy)}&apos;s secret challenge was:</p>
        <RuleList challenge={gift.challenge} animate />
        <p className="mb-2 mt-5 text-center font-semibold">Did they follow it?</p>
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
  busy,
  error,
}: {
  game: GameView;
  live: PublicLiveState;
  myId: string | null;
  onVote: (giftId: string) => (v: Vote | null) => void;
  mode: Mode;
  act: Act;
  busy: boolean;
  error: string | null;
}) {
  const mine = myId ? giftHeldBy(live, myId) : null;
  const myCreative = myId ? live.creativeVotes?.[myId] : undefined;
  const ballotCount = Object.keys(live.creativeVotes ?? {}).length;

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

      <Card className="bg-gradient-to-b from-gold-soft/60 to-white">
        <h2 className="mb-3 text-center font-display text-2xl font-semibold">🏅 Awards</h2>
        <AwardsList live={live} />
        <p className="mt-3 text-center text-xs text-muted">Awards update live as people vote.</p>
      </Card>

      {myId && (
        <Card className="mt-4">
          <h2 className="font-display text-xl font-semibold">🎨 Most Creative Interpretation</h2>
          <p className="mb-3 text-sm text-muted">Which gift bent its challenge most brilliantly? ({ballotCount} vote{ballotCount === 1 ? "" : "s"} so far)</p>
          <div className="flex flex-wrap gap-2">
            {live.gifts
              .filter((g) => g.broughtBy !== myId)
              .map((g) => (
                <button
                  key={g.id}
                  disabled={busy}
                  onClick={() => act({ type: "creativeVote", giftId: myCreative === g.id ? null : g.id })}
                  aria-pressed={myCreative === g.id}
                  className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-all active:scale-95 ${myCreative === g.id ? "scale-105 bg-gold text-ink shadow" : "bg-cream"}`}
                >
                  {g.label}
                </button>
              ))}
          </div>
          <div className="mt-2">
            <ErrorNote>{error}</ErrorNote>
          </div>
        </Card>
      )}

      <Card className="mt-4">
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

      {mode === "host" && (
        <div className="mt-4 grid gap-2">
          <Link href={`/screen/${game.code}`} target="_blank" className="block rounded-2xl bg-pine/10 py-3 text-center font-semibold text-pine hover:bg-pine/15">
            📺 Show the awards on the TV
          </Link>
          {live.canUndo && (
            <Button variant="ghost" className="w-full" onClick={() => act({ type: "undo" })}>
              ↩️ Undo the ending
            </Button>
          )}
        </div>
      )}
    </Page>
  );
}
