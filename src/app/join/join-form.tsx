"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { BackLink, Button, Card, ErrorNote, Page } from "@/components/ui";
import { api } from "@/lib/client/api";
import { loadSession, saveSession } from "@/lib/client/session";

export function JoinForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [code, setCode] = useState(() => (params.get("code") ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5));
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already joined this game on this phone? Go straight back to it.
  useEffect(() => {
    if (code.length === 5 && loadSession(code).playerToken) router.replace(`/play/${code}`);
  }, [code, router]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.join(code, name.trim());
      saveSession(res.code, { playerId: res.playerId, playerToken: res.playerToken });
      router.push(`/play/${res.code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't join");
      setBusy(false);
    }
  }

  return (
    <Page>
      <BackLink />
      <div className="mb-6 text-center">
        <p className="text-6xl" aria-hidden>
          <span className="inline-block animate-wiggle">🎟️</span>
        </p>
        <h1 className="mt-2 font-display text-3xl font-extrabold text-pine-deep">Join the exchange</h1>
      </div>
      <Card>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="code" className="mb-1.5 block text-sm font-semibold text-muted">
              Join code
            </label>
            <input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5))}
              placeholder="ABC12"
              autoCapitalize="characters"
              autoComplete="off"
              className="w-full rounded-2xl bg-cream px-4 py-3 text-center font-display text-3xl font-semibold tracking-[0.3em] outline-none ring-pine/40 placeholder:text-ink/25 focus:ring-2"
            />
          </div>
          <div>
            <label htmlFor="name" className="mb-1.5 block text-sm font-semibold text-muted">
              Your name
            </label>
            <input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Aunt Linda"
              maxLength={24}
              autoComplete="given-name"
              className="w-full rounded-2xl bg-cream px-4 py-3 text-lg outline-none ring-pine/40 focus:ring-2"
            />
          </div>
          <ErrorNote>{error}</ErrorNote>
          <Button type="submit" className="w-full text-lg" disabled={busy || code.length < 5 || !name.trim()}>
            {busy ? "Joining…" : "Get my challenge 🎁"}
          </Button>
        </form>
      </Card>
    </Page>
  );
}
