"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { TYPE_META } from "@/components/challenge-card";
import { BackLink, Button, Card, ErrorNote, Page, Toggle } from "@/components/ui";
import { TWISTS } from "@/data/twists";
import { api } from "@/lib/client/api";
import { saveSession } from "@/lib/client/session";
import { DEFAULT_TWIST_CHANCE, DIFFICULTIES, defaultSettings, defaultTwistIds } from "@/lib/settings";
import { CHALLENGE_TYPES, type ChallengeType, type Difficulty, type GameSettings } from "@/lib/types";

const TYPE_HINTS: Record<ChallengeType, string> = {
  category: "“Something for the kitchen”",
  letter: "“Its name starts with P”",
  constraint: "“Must make noise”",
  wrapping: "“Wrapped in newspaper only”",
};

export default function NewGamePage() {
  const router = useRouter();
  const [settings, setSettings] = useState<GameSettings>(() => defaultSettings("normal"));
  const [playing, setPlaying] = useState(true);
  const [hostName, setHostName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patch = (p: Partial<GameSettings>) => setSettings((s) => ({ ...s, ...p }));
  const patchTwists = (p: Partial<GameSettings["twists"]>) => setSettings((s) => ({ ...s, twists: { ...s.twists, ...p } }));

  function pickDifficulty(d: Difficulty) {
    // Switching mode resets twist defaults to suit it.
    setSettings((s) => ({ ...s, difficulty: d, twists: { ...s.twists, chance: DEFAULT_TWIST_CHANCE[d], enabledIds: defaultTwistIds(d) } }));
  }

  const noTypes = !CHALLENGE_TYPES.some((t) => settings.challengeTypes[t]);
  const needsName = playing && !hostName.trim();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.createGame(settings, playing ? hostName.trim() : null);
      saveSession(res.code, { hostToken: res.hostToken, playerId: res.playerId, playerToken: res.playerToken });
      router.push(`/host/${res.code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create the game");
      setBusy(false);
    }
  }

  return (
    <Page>
      <BackLink />
      <h1 className="mb-1 font-display text-3xl font-extrabold text-pine-deep">Host a game</h1>
      <p className="mb-6 text-muted">Set the rules, then share the code.</p>

      <form onSubmit={submit} className="space-y-4">
        <Card>
          <label htmlFor="price" className="mb-2 block font-semibold">
            Price limit
          </label>
          <div className="flex items-center gap-2 rounded-2xl bg-cream px-4 py-2 ring-pine/40 focus-within:ring-2">
            <span className="font-display text-2xl text-muted">$</span>
            <input
              id="price"
              type="number"
              inputMode="numeric"
              min={1}
              max={10000}
              value={settings.priceLimit || ""}
              onChange={(e) => patch({ priceLimit: Number(e.target.value) })}
              className="w-full bg-transparent font-display text-2xl font-semibold outline-none"
            />
          </div>
        </Card>

        <Card>
          <p className="mb-3 font-semibold">Difficulty</p>
          <div className="grid grid-cols-3 gap-2" role="radiogroup">
            {DIFFICULTIES.map((d) => {
              const active = settings.difficulty === d.id;
              return (
                <button
                  key={d.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => pickDifficulty(d.id)}
                  className={`rounded-2xl p-3 text-center transition-all ${
                    active ? "bg-pine text-white shadow-md scale-[1.03]" : "bg-cream text-ink hover:bg-gold-soft"
                  }`}
                >
                  <span className="block text-2xl" aria-hidden>
                    {d.emoji}
                  </span>
                  <span className="block font-semibold">{d.label}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-sm text-muted">{DIFFICULTIES.find((d) => d.id === settings.difficulty)?.blurb}</p>
        </Card>

        <Card>
          <p className="mb-1 font-semibold">Gift challenges</p>
          <p className="mb-2 text-sm text-muted">Which kinds of rule can players get?</p>
          <div className="divide-y divide-ink/5">
            {CHALLENGE_TYPES.map((t) => (
              <Toggle
                key={t}
                label={
                  <>
                    <span aria-hidden>{TYPE_META[t].emoji}</span> {TYPE_META[t].label}
                  </>
                }
                hint={TYPE_HINTS[t]}
                checked={settings.challengeTypes[t]}
                onChange={(v) => patch({ challengeTypes: { ...settings.challengeTypes, [t]: v } })}
              />
            ))}
          </div>
          {noTypes && <ErrorNote>Turn on at least one kind of challenge.</ErrorNote>}
        </Card>

        <Card>
          <Toggle
            label="🌀 Game twists"
            hint="Random events between turns"
            checked={settings.twists.enabled}
            onChange={(v) => patchTwists({ enabled: v })}
          />
          {settings.twists.enabled && (
            <div className="mt-2 space-y-4 animate-pop-in">
              <div>
                <label htmlFor="chance" className="flex justify-between text-sm font-medium">
                  <span>Chance after each turn</span>
                  <span className="font-semibold text-pine">{Math.round(settings.twists.chance * 100)}%</span>
                </label>
                <input
                  id="chance"
                  type="range"
                  min={0}
                  max={60}
                  step={5}
                  value={Math.round(settings.twists.chance * 100)}
                  onChange={(e) => patchTwists({ chance: Number(e.target.value) / 100 })}
                  className="mt-2 w-full accent-pine"
                />
              </div>
              <details className="rounded-2xl bg-cream p-3">
                <summary className="cursor-pointer text-sm font-semibold">
                  Choose twists ({settings.twists.enabledIds.length}/{TWISTS.length} on)
                </summary>
                <ul className="mt-2 divide-y divide-ink/5">
                  {TWISTS.map((t) => (
                    <li key={t.id}>
                      <Toggle
                        label={
                          <>
                            {t.emoji} {t.title} <span className="ml-1 text-xs font-normal text-muted">{t.difficulty}</span>
                          </>
                        }
                        hint={t.description}
                        checked={settings.twists.enabledIds.includes(t.id)}
                        onChange={(on) =>
                          patchTwists({
                            enabledIds: on ? [...settings.twists.enabledIds, t.id] : settings.twists.enabledIds.filter((id) => id !== t.id),
                          })
                        }
                      />
                    </li>
                  ))}
                </ul>
              </details>
            </div>
          )}
        </Card>

        <Card>
          <p className="mb-1 font-semibold">Steal limit</p>
          <p className="mb-3 text-sm text-muted">A gift is locked after this many steals.</p>
          <div className="flex items-center justify-between rounded-2xl bg-cream p-2">
            <Button type="button" variant="ghost" className="w-12 px-0" onClick={() => patch({ maxStealsPerGift: Math.max(1, settings.maxStealsPerGift - 1) })} aria-label="Fewer steals">
              −
            </Button>
            <span className="font-display text-2xl font-semibold">{settings.maxStealsPerGift}</span>
            <Button type="button" variant="ghost" className="w-12 px-0" onClick={() => patch({ maxStealsPerGift: Math.min(10, settings.maxStealsPerGift + 1) })} aria-label="More steals">
              +
            </Button>
          </div>
          <div className="mt-2">
            <Toggle
              label="🔄 Final swap"
              hint="When every gift is open, the first player may swap with anyone"
              checked={settings.finalSwap}
              onChange={(v) => patch({ finalSwap: v })}
            />
          </div>
        </Card>

        <Card>
          <Toggle label="🙋 I'm playing too" hint="You'll get a challenge like everyone else" checked={playing} onChange={setPlaying} />
          {playing && (
            <input
              value={hostName}
              onChange={(e) => setHostName(e.target.value)}
              placeholder="Your name"
              maxLength={24}
              autoComplete="given-name"
              className="mt-2 w-full rounded-2xl bg-cream px-4 py-3 outline-none ring-pine/40 focus:ring-2 animate-pop-in"
            />
          )}
        </Card>

        <ErrorNote>{error}</ErrorNote>
        <Button type="submit" className="w-full text-lg" disabled={busy || noTypes || needsName || !settings.priceLimit}>
          {busy ? "Wrapping it up…" : "Create game 🎁"}
        </Button>
      </form>
    </Page>
  );
}
