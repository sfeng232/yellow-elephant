"use client";

import type { ReactNode } from "react";
import { ButtonLink, Page, Spinner } from "@/components/ui";
import type { ApiError } from "@/lib/client/api";
import type { GameView } from "@/lib/types";

/** Shows loading / not-found states until the game view is ready. */
export function GameGate({ game, error, children }: { game: GameView | null; error: ApiError | null; children: (game: GameView) => ReactNode }) {
  if (error?.status === 404) {
    return (
      <Page className="flex flex-col items-center justify-center text-center">
        <p className="mb-3 text-6xl" aria-hidden>
          🧊
        </p>
        <h1 className="font-display text-3xl font-extrabold text-pine-deep">Game not found</h1>
        <p className="mt-2 mb-6 text-muted">{error.message}</p>
        <ButtonLink href="/">Back home</ButtonLink>
      </Page>
    );
  }
  if (!game) return <Spinner label={error ? error.message : "Loading game…"} />;
  return <>{children(game)}</>;
}
