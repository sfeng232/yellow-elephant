"use client";

import { useRouter } from "next/navigation";
import { use, useEffect, useState, useSyncExternalStore } from "react";
import { ChallengeCard } from "@/components/challenge-card";
import { GameGate } from "@/components/game-gate";
import { LiveGame } from "@/components/live/live-game";
import { Button, ButtonLink, Card, ErrorNote, Page } from "@/components/ui";
import { api } from "@/lib/client/api";
import { clearPlayer, loadSession } from "@/lib/client/session";
import { useGame } from "@/lib/client/use-game";
import { challengeKey } from "@/lib/challenges";
import { DIFFICULTIES } from "@/lib/settings";
import type { GameView } from "@/lib/types";

const noSubscribe = () => () => {};

export function PlayerScreen({ params }: { params: Promise<{ code: string }> }) {
  const code = use(params).code.toUpperCase();
  const router = useRouter();
  // localStorage only exists in the browser, so the server render sees `null`.
  const hasToken = useSyncExternalStore(
    noSubscribe,
    () => Boolean(loadSession(code).playerToken),
    () => null,
  );

  useEffect(() => {
    if (hasToken === false) router.replace(`/join?code=${code}`);
  }, [hasToken, code, router]);

  const { game, error, refresh } = useGame(code);
  if (!hasToken) return null;
  return (
    <GameGate game={game} error={error}>
      {(g) => (g.live && g.me ? <LiveGame game={g} mode="player" refresh={refresh} /> : <Lobby game={g} refresh={refresh} />)}
    </GameGate>
  );
}

function Lobby({ game, refresh }: { game: GameView; refresh: () => Promise<void> }) {
  const router = useRouter();
  const [revealed, setRevealed] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [shaking, setShaking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const me = game.me;
  if (!me) {
    return (
      <Page className="text-center">
        <p className="mt-16 text-6xl" aria-hidden>
          🌨️
        </p>
        <h1 className="mt-3 font-display text-3xl font-extrabold text-pine-deep">You&apos;re not in this game</h1>
        <p className="mt-2 mb-6 text-muted">The host may have removed you, or you joined on a different device.</p>
        <Button
          onClick={() => {
            clearPlayer(game.code);
            router.push(`/join?code=${game.code}`);
          }}
        >
          Join again
        </Button>
      </Page>
    );
  }

  async function reroll() {
    setBusy(true);
    setError(null);
    setConfirming(false);
    setRevealed(false);
    setShaking(true);
    try {
      await api.reroll(game.code);
      await refresh();
      // Let the card land face down, then flip up the new challenge.
      setTimeout(() => {
        setShaking(false);
        setRevealed(true);
      }, 650);
    } catch (err) {
      setShaking(false);
      setError(err instanceof Error ? err.message : "Couldn't re-roll");
    } finally {
      setBusy(false);
    }
  }

  async function leave() {
    if (!confirm("Leave this game? You'll lose your challenge.")) return;
    try {
      await api.removePlayer(game.code, me!.id);
    } catch {
      /* already gone */
    }
    clearPlayer(game.code);
    router.push("/");
  }

  const mode = DIFFICULTIES.find((d) => d.id === game.settings.difficulty)!;
  const others = game.players.filter((p) => p.id !== me.id);

  return (
    <Page>
      <header className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-sm text-muted">Game {game.code}</p>
          <h1 className="font-display text-2xl font-extrabold text-pine-deep">Hi, {me.name}! 👋</h1>
        </div>
        <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold ring-1 ring-ink/10">
          {mode.emoji} {mode.label} · ${game.settings.priceLimit}
        </span>
      </header>

      <div className={shaking ? "animate-shake" : ""}>
        <ChallengeCard challenge={me.challenge} revealed={revealed} onToggle={() => setRevealed((r) => !r)} rerollKey={challengeKey(me.challenge)} />
      </div>

      <div className="mt-4 space-y-2">
        {game.status === "lobby" && me.rerollsLeft > 0 && revealed && !confirming && (
          <Button variant="ghost" className="w-full animate-pop-in" onClick={() => setConfirming(true)} disabled={busy}>
            🎲 Re-roll my challenge (1 left)
          </Button>
        )}
        {confirming && (
          <Card className="animate-pop-in text-center">
            <p className="mb-3 font-medium">You only get one re-roll, and the new challenge is final. Sure?</p>
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => setConfirming(false)}>
                Keep this one
              </Button>
              <Button className="flex-1" onClick={reroll} disabled={busy}>
                Re-roll!
              </Button>
            </div>
          </Card>
        )}
        {me.rerollsLeft === 0 && revealed && <p className="text-center text-sm text-muted">Re-roll used. This one&apos;s yours! 🎄</p>}
        <ErrorNote>{error}</ErrorNote>
      </div>

      <Card className="mt-6">
        <h2 className="mb-1 font-display text-lg font-semibold">Waiting for the party</h2>
        <p className="mb-3 text-sm text-muted">
          The live exchange starts when the host kicks it off. Bring a wrapped gift that follows your challenge!
        </p>
        <div className="flex flex-wrap gap-1.5">
          {others.map((p) => (
            <span key={p.id} className="rounded-full bg-cream px-3 py-1 text-sm animate-pop-in">
              {p.name}
            </span>
          ))}
          {others.length === 0 && <span className="text-sm text-muted">Nobody else yet…</span>}
        </div>
      </Card>

      <div className="mt-6 flex justify-center gap-4 text-sm">
        {game.isHost && (
          <ButtonLink href={`/host/${game.code}`} variant="ghost">
            Host controls
          </ButtonLink>
        )}
        {!game.isHost && game.status === "lobby" && (
          <button onClick={leave} className="text-muted underline-offset-4 hover:text-berry hover:underline">
            Leave game
          </button>
        )}
      </div>
    </Page>
  );
}
