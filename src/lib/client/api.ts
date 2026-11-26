"use client";

import type { ClientAction, GameSettings, GameView } from "@/lib/types";
import { loadSession } from "./session";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function call<T>(method: string, path: string, code: string | null, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (code) {
    const s = loadSession(code);
    if (s.playerToken) headers["x-player-token"] = s.playerToken;
    if (s.hostToken) headers["x-host-token"] = s.hostToken;
  }
  const res = await fetch(path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? "Something went wrong");
  return data as T;
}

const base = (code: string) => `/api/games/${encodeURIComponent(code)}`;

export const api = {
  createGame: (settings: GameSettings, hostName: string | null) =>
    call<{ code: string; hostToken: string; playerId: string | null; playerToken: string | null }>(
      "POST",
      "/api/games",
      null,
      { settings, hostName },
    ),
  getGame: (code: string) => call<GameView>("GET", base(code), code),
  join: (code: string, name: string) =>
    call<{ code: string; playerId: string; playerToken: string }>("POST", `${base(code)}/join`, null, { name }),
  reroll: (code: string) => call<{ ok: true }>("POST", `${base(code)}/reroll`, code),
  removePlayer: (code: string, playerId: string) =>
    call<{ ok: true }>("DELETE", `${base(code)}/players/${encodeURIComponent(playerId)}`, code),
  start: (code: string) => call<{ ok: true }>("POST", `${base(code)}/start`, code, {}),
  act: (code: string, action: ClientAction) => call<{ ok: true }>("POST", `${base(code)}/action`, code, action),
};
