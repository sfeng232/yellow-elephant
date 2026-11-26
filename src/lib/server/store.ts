import "server-only";
import type { Challenge, GameSettings, GameStatus } from "@/lib/types";
import { memoryStore } from "./memory-store";
import { supabaseStore } from "./supabase-store";

export interface GameRecord {
  id: string;
  code: string;
  hostTokenHash: string;
  settings: GameSettings;
  status: GameStatus;
  /** Live-game state (Phase 2+). */
  state: unknown;
  version: number;
  createdAt: string;
  expiresAt: string;
}

export interface PlayerRecord {
  id: string;
  gameId: string;
  name: string;
  tokenHash: string;
  challenge: Challenge;
  rerollsLeft: number;
  isHost: boolean;
  joinedAt: string;
}

export interface Store {
  /** Returns false if the code is already taken. */
  createGame(game: GameRecord): Promise<boolean>;
  getGameByCode(code: string): Promise<GameRecord | null>;
  /** Bumps the version. Returns false if someone else changed the game first. */
  updateGame(id: string, expectedVersion: number, patch: Partial<Pick<GameRecord, "status" | "state" | "settings">>): Promise<boolean>;
  /** Bumps the version without other changes, so listeners know the player list changed. */
  touchGame(id: string): Promise<void>;
  listPlayers(gameId: string): Promise<PlayerRecord[]>;
  /** Returns false if the name is already taken in this game (case-insensitive). */
  addPlayer(player: PlayerRecord): Promise<boolean>;
  updatePlayer(id: string, patch: Partial<Pick<PlayerRecord, "challenge" | "rerollsLeft">>): Promise<void>;
  deletePlayer(id: string): Promise<void>;
}

export function hasSupabase(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

let warned = false;
export function getStore(): Store {
  if (hasSupabase()) return supabaseStore();
  if (process.env.NODE_ENV === "production" && !warned) {
    console.warn("[elephant] Supabase env vars missing — using the in-memory store. Games will vanish on restart.");
    warned = true;
  }
  return memoryStore();
}
