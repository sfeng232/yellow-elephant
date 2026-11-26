"use client";

import Link from "next/link";
import { use, useState } from "react";
import { useJoinUrl } from "@/lib/client/use-join-url";
import { TYPE_META } from "@/components/challenge-card";
import { GameGate } from "@/components/game-gate";
import { LiveGame } from "@/components/live/live-game";
import { Button, ButtonLink, Card, ErrorNote, Page } from "@/components/ui";
import { api } from "@/lib/client/api";
import { useGame } from "@/lib/client/use-game";
import { DIFFICULTIES } from "@/lib/settings";
import { CHALLENGE_TYPES, type GameView } from "@/lib/types";

export function HostLobby({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const { game, error, refresh } = useGame(code.toUpperCase());
  return (
    <GameGate game={game} error={error}>
      {(g) => (g.live && g.isHost ? <LiveGame game={g} mode="host" refresh={refresh} /> : <Lobby game={g} refresh={refresh} />)}
    </GameGate>
  );
}

function Lobby({ game, refresh }: { game: GameView; refresh: () => Promise<void> }) {
  const { url, qr } = useJoinUrl(game.code);
  const [now] = useState(() => Date.now());
  const [copied, setCopied] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!game.isHost) {
    return (
      <Page className="text-center">
        <h1 className="mt-16 font-display text-3xl font-extrabold text-pine-deep">This isn&apos;t your game to host</h1>
        <p className="mt-2 mb-6 text-muted">Host controls only work on the device that created the game.</p>
        <ButtonLink href={`/join?code=${game.code}`}>Join as a player instead</ButtonLink>
      </Page>
    );
  }

  async function share() {
    if (!url) return;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Join our White Elephant", text: `Join code: ${game.code}`, url });
        return;
      } catch {
        /* cancelled: fall through to copy */
      }
    }
    await navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Remove ${name} from the game?`)) return;
    try {
      await api.removePlayer(game.code, id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't remove player");
    }
  }

  async function start() {
    const unrolled = game.players.filter((p) => p.rerollsLeft > 0).length;
    const note = unrolled > 0 ? `\n\nChallenges lock once you start (${unrolled} player${unrolled === 1 ? "" : "s"} haven't used their re-roll).` : "";
    if (!confirm(`Start with ${game.players.length} players? Nobody else can join after this.${note}`)) return;
    setStarting(true);
    setError(null);
    try {
      await api.start(game.code);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't start");
    } finally {
      setStarting(false);
    }
  }

  const me = game.me;
  const mode = DIFFICULTIES.find((d) => d.id === game.settings.difficulty)!;
  const hours = Math.max(0, Math.round((Date.parse(game.expiresAt) - now) / 3_600_000));

  return (
    <Page>
      <p className="text-center text-sm font-semibold uppercase tracking-widest text-muted">Join code</p>
      <h1 className="text-center font-display text-6xl font-extrabold tracking-[0.18em] text-berry animate-pop-in">{game.code}</h1>

      <Card className="mt-5 flex flex-col items-center gap-4">
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element -- data URL, nothing to optimise
          <img src={qr} alt={`QR code to join game ${game.code}`} className="h-44 w-44 rounded-2xl animate-pop-in" />
        ) : (
          <div className="h-44 w-44 rounded-2xl bg-cream" />
        )}
        <p className="text-center text-sm text-muted">Scan to join, or go to this site and enter the code.</p>
        <Button variant="gold" onClick={share} className="w-full">
          {copied ? "Link copied! ✨" : "Share invite link"}
        </Button>
        <Link href={`/screen/${game.code}`} target="_blank" className="text-sm font-semibold text-pine underline-offset-4 hover:underline">
          📺 Open the TV screen (shows the QR code big)
        </Link>
      </Card>

      <Card className="mt-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-display text-xl font-semibold">Players</h2>
          <span className="rounded-full bg-pine/10 px-2.5 py-0.5 text-sm font-semibold text-pine">{game.players.length}</span>
        </div>
        {game.players.length === 0 ? (
          <p className="rounded-2xl bg-cream p-4 text-center text-sm text-muted">Waiting for players to join… 🦌</p>
        ) : (
          <ul className="space-y-2">
            {game.players.map((p) => (
              <li key={p.id} className="flex items-center gap-3 rounded-2xl bg-cream px-3 py-2.5 animate-pop-in">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-white font-display font-semibold text-pine">
                  {p.name.slice(0, 1).toUpperCase()}
                </span>
                <span className="flex-1 font-medium">
                  {p.name} {p.isHost && <span className="text-xs text-muted">(host)</span>}
                </span>
                {p.rerollsLeft === 0 && <span className="text-xs text-muted" title="Used their re-roll">🎲 re-rolled</span>}
                {p.id !== me?.id && (
                  <button onClick={() => remove(p.id, p.name)} className="rounded-full px-2 text-muted hover:text-berry" aria-label={`Remove ${p.name}`}>
                    ✕
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        <ErrorNote>{error}</ErrorNote>
      </Card>

      {me && (
        <ButtonLink href={`/play/${game.code}`} variant="secondary" className="mt-4 w-full">
          🤫 See my secret challenge
        </ButtonLink>
      )}

      <Card className="mt-4">
        <h2 className="mb-3 font-display text-xl font-semibold">Game rules</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Stat label="Price limit" value={`$${game.settings.priceLimit}`} />
          <Stat label="Difficulty" value={`${mode.emoji} ${mode.label}`} />
          <Stat label="Steal limit" value={`${game.settings.maxStealsPerGift} per gift${game.settings.finalSwap ? " + final swap" : ""}`} />
          <Stat label="Twists" value={game.settings.twists.enabled ? `${Math.round(game.settings.twists.chance * 100)}% chance` : "Off"} />
        </dl>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {CHALLENGE_TYPES.filter((t) => game.settings.challengeTypes[t]).map((t) => (
            <span key={t} className={`rounded-full px-2.5 py-1 text-xs font-semibold ${TYPE_META[t].className}`}>
              {TYPE_META[t].emoji} {TYPE_META[t].label}
            </span>
          ))}
        </div>
      </Card>

      <Button className="mt-6 w-full text-lg" disabled={starting || game.players.length < 2} onClick={start}>
        {starting ? "Shuffling turn order…" : "🎲 Start the exchange"}
      </Button>
      {game.players.length < 2 && <p className="mt-2 text-center text-sm text-muted">You need at least 2 players.</p>}
      <p className="mt-3 text-center text-xs text-muted">This game expires in about {hours} hours.</p>
    </Page>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-cream p-3">
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="font-semibold">{value}</dd>
    </div>
  );
}
