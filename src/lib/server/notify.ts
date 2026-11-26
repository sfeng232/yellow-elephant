import "server-only";
import { gameChannel } from "@/lib/channel";
import { hasSupabase } from "./store";

/**
 * Tells every phone watching this game that something changed. Phones then re-fetch
 * their own view from the API, so no game data or secrets travel over the broadcast.
 * Uses Supabase Realtime's REST broadcast endpoint. Without Supabase, phones poll instead.
 */
export async function notifyGameChanged(code: string, version: number): Promise<void> {
  if (!hasSupabase()) return;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  const headers: Record<string, string> = { "Content-Type": "application/json", apikey: key };
  // Legacy keys are JWTs and also go in Authorization; new sb_secret_ keys only go in apikey.
  if (key.startsWith("eyJ")) headers.Authorization = `Bearer ${key}`;
  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers,
      body: JSON.stringify({ messages: [{ topic: gameChannel(code), event: "changed", payload: { version } }] }),
    });
    if (!res.ok) console.warn(`[elephant] broadcast failed: ${res.status} ${await res.text()}`);
  } catch (err) {
    // A missed ping isn't fatal: phones also poll.
    console.warn("[elephant] broadcast error", err);
  }
}
