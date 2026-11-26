"use client";

/** What this browser knows about a game: its player token and/or host token. */
export interface GameSession {
  playerId?: string | null;
  playerToken?: string | null;
  hostToken?: string | null;
}

const key = (code: string) => `elephant:${code.toUpperCase()}`;

export function loadSession(code: string): GameSession {
  try {
    return JSON.parse(localStorage.getItem(key(code)) ?? "{}") as GameSession;
  } catch {
    return {};
  }
}

export function saveSession(code: string, patch: GameSession): void {
  try {
    localStorage.setItem(key(code), JSON.stringify({ ...loadSession(code), ...patch }));
  } catch {
    // Private mode etc. The game still works this visit; it just won't survive a reload.
  }
}

export function clearPlayer(code: string): void {
  saveSession(code, { playerId: null, playerToken: null });
}
