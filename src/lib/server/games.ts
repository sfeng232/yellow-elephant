import "server-only";
import { randomUUID } from "node:crypto";
import { generateChallenge, rerollChallenge } from "@/lib/challenges";
import { applyAction, createLiveState, EngineError, playerName, toPublic } from "@/lib/game/engine";
import { parseSettings } from "@/lib/settings";
import type { ClientAction, GameView, LiveState } from "@/lib/types";
import { notifyGameChanged } from "./notify";
import { hashToken, newJoinCode, newToken, normalizeCode, tokenMatches } from "./security";
import { getStore, type GameRecord, type PlayerRecord } from "./store";

export const GAME_TTL_MS = 48 * 60 * 60 * 1000;
export const MAX_PLAYERS = 40;
const REROLLS_PER_PLAYER = 1;

export class GameError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface Credentials {
  playerToken?: string | null;
  hostToken?: string | null;
}

export function cleanName(input: unknown): string {
  const name = String(input ?? "").replace(/\s+/g, " ").trim().slice(0, 24);
  if (name.length < 1) throw new GameError(400, "Enter a name");
  return name;
}

/** Loads a live (non-expired) game or throws 404. */
export async function loadGame(rawCode: string): Promise<GameRecord> {
  const code = normalizeCode(rawCode);
  const game = code ? await getStore().getGameByCode(code) : null;
  if (!game || Date.parse(game.expiresAt) < Date.now()) {
    throw new GameError(404, "No game with that code (games expire after 48 hours)");
  }
  return game;
}

function usedRuleIds(players: PlayerRecord[]): Set<string> {
  return new Set(players.flatMap((p) => p.challenge.rules.map((r) => r.id)));
}

async function addPlayerTo(game: GameRecord, name: string, isHost: boolean) {
  const store = getStore();
  const players = await store.listPlayers(game.id);
  if (game.status !== "lobby") throw new GameError(409, "This game has already started");
  if (players.length >= MAX_PLAYERS) throw new GameError(409, `Games are capped at ${MAX_PLAYERS} players`);

  const token = newToken();
  const player: PlayerRecord = {
    id: randomUUID(),
    gameId: game.id,
    name,
    tokenHash: hashToken(token),
    // Spread rules across players so two people rarely get the same challenge.
    challenge: generateChallenge({ settings: game.settings, avoidIds: usedRuleIds(players) }),
    rerollsLeft: REROLLS_PER_PLAYER,
    isHost,
    joinedAt: new Date().toISOString(),
  };
  if (!(await store.addPlayer(player))) throw new GameError(409, `Someone called "${name}" already joined. Try a nickname!`);
  return { player, token };
}

async function changed(game: GameRecord) {
  await getStore().touchGame(game.id);
  await notifyGameChanged(game.code, game.version + 1);
}

export async function createGame(body: { settings?: unknown; hostName?: unknown }) {
  const parsed = parseSettings(body.settings);
  if (!parsed.ok) throw new GameError(400, parsed.error);
  const hostName = body.hostName ? cleanName(body.hostName) : null;

  const hostToken = newToken();
  const now = Date.now();
  const store = getStore();
  for (let attempt = 0; attempt < 8; attempt++) {
    const game: GameRecord = {
      id: randomUUID(),
      code: newJoinCode(),
      hostTokenHash: hashToken(hostToken),
      settings: parsed.settings,
      status: "lobby",
      state: null,
      version: 1,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + GAME_TTL_MS).toISOString(),
    };
    if (!(await store.createGame(game))) continue; // code collision, try another
    const hostPlayer = hostName ? await addPlayerTo(game, hostName, true) : null;
    return {
      code: game.code,
      hostToken,
      playerId: hostPlayer?.player.id ?? null,
      playerToken: hostPlayer?.token ?? null,
    };
  }
  throw new GameError(503, "Couldn't find a free join code, please try again");
}

export async function joinGame(code: string, body: { name?: unknown }) {
  const game = await loadGame(code);
  const { player, token } = await addPlayerTo(game, cleanName(body.name), false);
  await changed(game);
  return { code: game.code, playerId: player.id, playerToken: token };
}

async function findPlayer(game: GameRecord, creds: Credentials) {
  const players = await getStore().listPlayers(game.id);
  const me = creds.playerToken ? players.find((p) => tokenMatches(creds.playerToken, p.tokenHash)) : undefined;
  return { players, me };
}

export async function rerollMyChallenge(code: string, creds: Credentials) {
  const game = await loadGame(code);
  const { players, me } = await findPlayer(game, creds);
  if (!me) throw new GameError(403, "You're not in this game");
  if (game.status !== "lobby") throw new GameError(409, "Challenges are locked once the game starts");
  if (me.rerollsLeft <= 0) throw new GameError(409, "You've already used your re-roll. Good luck!");

  const others = players.filter((p) => p.id !== me.id);
  const challenge = rerollChallenge(me.challenge, { settings: game.settings, avoidIds: usedRuleIds(others) });
  await getStore().updatePlayer(me.id, { challenge, rerollsLeft: me.rerollsLeft - 1 });
  await changed(game);
}

export async function removePlayer(code: string, creds: Credentials, playerId: string) {
  const game = await loadGame(code);
  const isHost = tokenMatches(creds.hostToken, game.hostTokenHash);
  const { players, me } = await findPlayer(game, creds);
  const target = players.find((p) => p.id === playerId);
  if (!target) throw new GameError(404, "Player not found");
  // Hosts can remove anyone; players can remove themselves (leave).
  if (!isHost && me?.id !== target.id) throw new GameError(403, "Only the host can remove players");
  if (game.status !== "lobby") throw new GameError(409, "Players can't leave once the game starts");
  await getStore().deletePlayer(target.id);
  await changed(game);
}

export async function getGameView(code: string, creds: Credentials): Promise<GameView> {
  const game = await loadGame(code);
  const { players, me } = await findPlayer(game, creds);
  return {
    code: game.code,
    status: game.status,
    settings: game.settings,
    players: players.map((p) => ({ id: p.id, name: p.name, isHost: p.isHost, rerollsLeft: p.rerollsLeft })),
    expiresAt: game.expiresAt,
    version: game.version,
    isHost: tokenMatches(creds.hostToken, game.hostTokenHash),
    live: game.state ? toPublic(game.state as LiveState) : null,
    me: me ? { id: me.id, name: me.name, challenge: me.challenge, rerollsLeft: me.rerollsLeft } : null,
  };
}

// ---------- Live game ----------

/**
 * Loads the game, applies a change, and saves it only if nobody else changed it in
 * the meantime. On a clash it reloads and tries again, so the engine re-checks the
 * move against the latest state (e.g. two people stealing the same gift at once).
 */
async function mutateLive(
  code: string,
  change: (game: GameRecord, state: LiveState | null) => { state: LiveState; status?: GameRecord["status"] },
): Promise<void> {
  const store = getStore();
  for (let attempt = 0; attempt < 6; attempt++) {
    const game = await loadGame(code);
    let result;
    try {
      result = change(game, game.state as LiveState | null);
    } catch (err) {
      if (err instanceof EngineError) throw new GameError(409, err.message);
      throw err;
    }
    const status = result.status ?? (result.state.phase === "ended" ? "ended" : "live");
    if (await store.updateGame(game.id, game.version, { state: result.state, status })) {
      await notifyGameChanged(game.code, game.version + 1);
      return;
    }
    await new Promise((r) => setTimeout(r, 30 + Math.random() * 120));
  }
  throw new GameError(503, "Lots happening at once! Try again.");
}

export async function startGame(code: string, creds: Credentials) {
  const game = await loadGame(code);
  if (!tokenMatches(creds.hostToken, game.hostTokenHash)) throw new GameError(403, "Only the host can start the game");
  const players = await getStore().listPlayers(game.id);
  await mutateLive(code, (g) => {
    if (g.status !== "lobby") throw new GameError(409, "The game has already started");
    return { state: createLiveState(players.map((p) => ({ id: p.id, name: p.name })), Math.random), status: "live" };
  });
}

export function parseClientAction(body: Record<string, unknown>): ClientAction {
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  switch (body.type) {
    case "open":
      return { type: "open", label: str(body.label).replace(/\s+/g, " ").trim().slice(0, 60), broughtBy: str(body.broughtBy) };
    case "steal":
      return { type: "steal", giftId: str(body.giftId) };
    case "finalSwap":
      return { type: "finalSwap", giftId: body.giftId === null ? null : str(body.giftId) };
    case "vote":
      return { type: "vote", giftId: str(body.giftId), vote: body.vote === "up" || body.vote === "down" ? body.vote : null };
    case "end":
    case "undo":
      return { type: body.type };
    default:
      throw new GameError(400, "Unknown action");
  }
}

export async function performAction(code: string, creds: Credentials, action: ClientAction) {
  const game = await loadGame(code);
  const isHost = tokenMatches(creds.hostToken, game.hostTokenHash);
  const { players, me } = await findPlayer(game, creds);

  await mutateLive(code, (g, state) => {
    if (!state) throw new GameError(409, "The game hasn't started yet");
    const settings = g.settings;

    if (action.type === "end" || action.type === "undo") {
      if (!isHost) throw new GameError(403, "Only the host can do that");
      return { state: applyAction(state, { type: action.type, by: me?.id ?? "" }, settings) };
    }

    if (action.type === "vote") {
      if (!me) throw new GameError(403, "Only players can vote");
      return { state: applyAction(state, { ...action, by: me.id }, settings) };
    }

    // Turn moves: the current player, or the host acting on their behalf.
    const by = me && state.actor === me.id ? me.id : isHost && state.actor ? state.actor : null;
    if (!by) throw new GameError(403, `It's ${playerName(state, state.actor)}'s move`);

    if (action.type === "open") {
      const bringer = players.find((p) => p.id === action.broughtBy);
      if (!bringer) throw new GameError(400, "Pick whose gift it is");
      return {
        state: applyAction(state, { type: "open", by, broughtBy: bringer.id, label: action.label, challenge: bringer.challenge, giftId: randomUUID() }, settings),
      };
    }
    return { state: applyAction(state, { ...action, by }, settings) };
  });
}
