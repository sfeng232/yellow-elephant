"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";
import { gameChannel } from "@/lib/channel";
import type { GameView } from "@/lib/types";
import { api, ApiError } from "./api";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

let browserClient: SupabaseClient | null = null;
function realtime(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_KEY) return null;
  browserClient ??= createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
  return browserClient;
}

/** Poll slowly as a safety net when realtime is on, faster when it's off (local dev). */
const POLL_MS = SUPABASE_URL && SUPABASE_KEY ? 15_000 : 2_500;

/**
 * Keeps a game view fresh. Listens for "changed" pings on the game's realtime channel
 * and re-fetches from the API, and also polls and refreshes when the tab regains focus.
 */
export function useGame(code: string) {
  const [game, setGame] = useState<GameView | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const loadRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    let cancelled = false;
    let inFlight = false;
    let again = false;

    // Coalesces bursts of pings into at most one extra fetch.
    const load = async (): Promise<void> => {
      if (inFlight) {
        again = true;
        return;
      }
      inFlight = true;
      try {
        const view = await api.getGame(code);
        if (cancelled) return;
        setGame((prev) => (prev && prev.version === view.version ? prev : view));
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err instanceof ApiError ? err : new ApiError(0, "Can't reach the server. Retrying…"));
      } finally {
        inFlight = false;
        if (again && !cancelled) {
          again = false;
          void load();
        }
      }
    };
    loadRef.current = load;

    void load();
    const timer = setInterval(() => void load(), POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", onVisible);

    const client = realtime();
    const channel = client
      ?.channel(gameChannel(code))
      .on("broadcast", { event: "changed" }, () => void load())
      .subscribe();

    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      if (channel) void client?.removeChannel(channel);
    };
  }, [code]);

  const refresh = useCallback(() => loadRef.current(), []);
  return { game, error, refresh };
}
