import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { GameRecord, PlayerRecord, Store } from "./store";

// Table shapes from supabase/schema.sql
interface GameRow {
  id: string;
  code: string;
  host_token_hash: string;
  settings: GameRecord["settings"];
  status: GameRecord["status"];
  state: unknown;
  version: number;
  created_at: string;
  expires_at: string;
}
interface PlayerRow {
  id: string;
  game_id: string;
  name: string;
  token_hash: string;
  challenge: PlayerRecord["challenge"];
  rerolls_left: number;
  is_host: boolean;
  joined_at: string;
}

const toGame = (r: GameRow): GameRecord => ({
  id: r.id,
  code: r.code,
  hostTokenHash: r.host_token_hash,
  settings: r.settings,
  status: r.status,
  state: r.state,
  version: r.version,
  createdAt: r.created_at,
  expiresAt: r.expires_at,
});
const toPlayer = (r: PlayerRow): PlayerRecord => ({
  id: r.id,
  gameId: r.game_id,
  name: r.name,
  tokenHash: r.token_hash,
  challenge: r.challenge,
  rerollsLeft: r.rerolls_left,
  isHost: r.is_host,
  joinedAt: r.joined_at,
});

let client: SupabaseClient | null = null;
function db(): SupabaseClient {
  // The service-role key bypasses row-level security. It must never reach the browser.
  client ??= createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

const UNIQUE_VIOLATION = "23505";

function check(error: { message: string; code?: string } | null): void {
  if (error) throw new Error(`Supabase: ${error.message}`);
}

export function supabaseStore(): Store {
  return {
    async createGame(game) {
      const { error } = await db().from("games").insert({
        id: game.id,
        code: game.code,
        host_token_hash: game.hostTokenHash,
        settings: game.settings,
        status: game.status,
        state: game.state,
        version: game.version,
        created_at: game.createdAt,
        expires_at: game.expiresAt,
      });
      if (error?.code === UNIQUE_VIOLATION) return false;
      check(error);
      return true;
    },
    async getGameByCode(code) {
      const { data, error } = await db().from("games").select("*").eq("code", code).maybeSingle<GameRow>();
      check(error);
      return data ? toGame(data) : null;
    },
    async updateGame(id, expectedVersion, patch) {
      // Optimistic concurrency: only succeeds if nobody else bumped the version.
      const { data, error } = await db()
        .from("games")
        .update({ ...patch, version: expectedVersion + 1 })
        .eq("id", id)
        .eq("version", expectedVersion)
        .select("id");
      check(error);
      return (data?.length ?? 0) > 0;
    },
    async touchGame(id) {
      const { error } = await db().rpc("touch_game", { game_id: id });
      check(error);
    },
    async listPlayers(gameId) {
      const { data, error } = await db()
        .from("players")
        .select("*")
        .eq("game_id", gameId)
        .order("joined_at", { ascending: true })
        .returns<PlayerRow[]>();
      check(error);
      return (data ?? []).map(toPlayer);
    },
    async addPlayer(p) {
      const { error } = await db().from("players").insert({
        id: p.id,
        game_id: p.gameId,
        name: p.name,
        token_hash: p.tokenHash,
        challenge: p.challenge,
        rerolls_left: p.rerollsLeft,
        is_host: p.isHost,
        joined_at: p.joinedAt,
      });
      if (error?.code === UNIQUE_VIOLATION) return false;
      check(error);
      return true;
    },
    async updatePlayer(id, patch) {
      const row: Partial<PlayerRow> = {};
      if (patch.challenge) row.challenge = patch.challenge;
      if (patch.rerollsLeft !== undefined) row.rerolls_left = patch.rerollsLeft;
      const { error } = await db().from("players").update(row).eq("id", id);
      check(error);
    },
    async deletePlayer(id) {
      const { error } = await db().from("players").delete().eq("id", id);
      check(error);
    },
  };
}
