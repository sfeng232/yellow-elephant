import "server-only";
import type { GameRecord, PlayerRecord, Store } from "./store";

/** Dev-only store kept on globalThis so it survives hot reloads. One server process only. */
interface MemoryData {
  games: Map<string, GameRecord>;
  players: Map<string, PlayerRecord>;
}

const g = globalThis as unknown as { __elephantMemory?: MemoryData };

export function memoryStore(): Store {
  const data = (g.__elephantMemory ??= { games: new Map(), players: new Map() });
  const clone = <T,>(v: T): T => structuredClone(v);

  return {
    async createGame(game) {
      for (const existing of data.games.values()) if (existing.code === game.code) return false;
      data.games.set(game.id, clone(game));
      return true;
    },
    async getGameByCode(code) {
      for (const game of data.games.values()) if (game.code === code) return clone(game);
      return null;
    },
    async updateGame(id, expectedVersion, patch) {
      const game = data.games.get(id);
      if (!game || game.version !== expectedVersion) return false;
      data.games.set(id, { ...game, ...clone(patch), version: game.version + 1 });
      return true;
    },
    async touchGame(id) {
      const game = data.games.get(id);
      if (game) game.version += 1;
    },
    async listPlayers(gameId) {
      return [...data.players.values()]
        .filter((p) => p.gameId === gameId)
        .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))
        .map(clone);
    },
    async addPlayer(player) {
      const taken = [...data.players.values()].some(
        (p) => p.gameId === player.gameId && p.name.toLowerCase() === player.name.toLowerCase(),
      );
      if (taken) return false;
      data.players.set(player.id, clone(player));
      return true;
    },
    async updatePlayer(id, patch) {
      const p = data.players.get(id);
      if (p) data.players.set(id, { ...p, ...clone(patch) });
    },
    async deletePlayer(id) {
      data.players.delete(id);
    },
  };
}
