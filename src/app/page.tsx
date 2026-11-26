"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, ButtonLink, Card, Page } from "@/components/ui";

export default function Home() {
  const router = useRouter();
  const [code, setCode] = useState("");

  return (
    <Page className="flex flex-col justify-center">
      <div className="mb-8 text-center animate-pop-in">
        <div className="mb-3 text-7xl">
          <span className="inline-block animate-wiggle" aria-hidden>
            🐘
          </span>
          <span className="inline-block animate-wiggle [animation-delay:400ms]" aria-hidden>
            🎁
          </span>
        </div>
        <h1 className="font-display text-5xl font-extrabold tracking-tight text-pine-deep">White Elephant</h1>
        <p className="mx-auto mt-3 max-w-xs text-muted">
          Secret gift challenges, sneaky steals and chaotic twists, all synced to everyone&apos;s phones.
        </p>
      </div>

      <Card className="space-y-4 animate-pop-in [animation-delay:120ms]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) router.push(`/join?code=${encodeURIComponent(code.trim().toUpperCase())}`);
          }}
          className="space-y-3"
        >
          <label htmlFor="code" className="block text-sm font-semibold text-muted">
            Got a join code?
          </label>
          <div className="flex gap-2">
            <input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5))}
              placeholder="ABC12"
              autoCapitalize="characters"
              autoComplete="off"
              className="min-w-0 flex-1 rounded-2xl bg-cream px-4 py-3 text-center font-display text-2xl font-semibold tracking-[0.3em] uppercase outline-none ring-pine/40 placeholder:text-ink/25 focus:ring-2"
            />
            <Button type="submit" disabled={code.length < 5}>
              Join
            </Button>
          </div>
        </form>
        <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-widest text-muted/70">
          <span className="h-px flex-1 bg-ink/10" /> or <span className="h-px flex-1 bg-ink/10" />
        </div>
        <ButtonLink href="/host/new" variant="secondary" className="w-full">
          🎄 Host a new game
        </ButtonLink>
      </Card>
    </Page>
  );
}
