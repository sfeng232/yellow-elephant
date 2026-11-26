// Shared types used by the server, the client, and the pure game logic.

export type Difficulty = "easy" | "normal" | "chaos";

/** The four kinds of gift challenge a host can switch on or off. */
export type ChallengeType = "category" | "letter" | "constraint" | "wrapping";

export const CHALLENGE_TYPES: ChallengeType[] = ["category", "letter", "constraint", "wrapping"];

/** A hand-written challenge in src/data/challenges.ts. Letter rules are generated, not listed. */
export interface ChallengeDef {
  id: string;
  type: Exclude<ChallengeType, "letter">;
  /** May contain {limit}, {half} or {quarter}, filled in from the game's price limit. */
  text: string;
  difficulty: Difficulty;
  /** Describes the rule, e.g. "edible", "electronic". Used for conflict checks. */
  tags?: string[];
  /** Tags this rule should never be combined with. */
  conflicts?: string[];
}

/** One rule as handed to a player (text already filled in). */
export interface ChallengeRule {
  id: string;
  type: ChallengeType;
  text: string;
  difficulty: Difficulty;
}

export interface Challenge {
  rules: ChallengeRule[];
}

export type TwistEffect =
  | { kind: "pass"; direction: "left" | "right" }
  | { kind: "reverseOrder" }
  | { kind: "stealLock"; turns: number }
  | { kind: "unlockAll" }
  | { kind: "swapAny"; who: "previous" | "next" }
  | { kind: "swapRandom" }
  | { kind: "shuffleAll" }
  | { kind: "blindPick" }
  | { kind: "mustOpen" }
  | { kind: "mustSteal" }
  | { kind: "freeSteal" }
  /** No state change: the group just does what the card says. */
  | { kind: "announce" };

export interface TwistDef {
  id: string;
  title: string;
  description: string;
  emoji: string;
  difficulty: Difficulty;
  effect: TwistEffect;
}

export interface GameSettings {
  priceLimit: number;
  difficulty: Difficulty;
  challengeTypes: Record<ChallengeType, boolean>;
  twists: {
    enabled: boolean;
    /** 0–1 chance that a twist fires between turns. */
    chance: number;
    enabledIds: string[];
  };
  /** A gift is locked once it has been stolen this many times. */
  maxStealsPerGift: number;
  /** After the last gift is opened, the first player may swap with anyone. */
  finalSwap: boolean;
}

// ---- Live game (Phase 2+) ----

export type Vote = "up" | "down";

export interface LivePlayer {
  id: string;
  name: string;
}

export interface Gift {
  id: string;
  /** Whose challenge this gift was meant to follow. */
  broughtBy: string;
  label: string;
  holder: string;
  stealCount: number;
  openedAtTurn: number;
  /** Copied from the bringer when opened, so it's public from then on. */
  challenge: Challenge;
  votes: Record<string, Vote>;
}

export type LivePhase = "turns" | "finalSwap" | "ended";

export interface GameEvent {
  seq: number;
  kind: "start" | "open" | "steal" | "swap" | "keep" | "end" | "undo";
  /** Who did it (for undo/end, the host's player id if they play, else ""). */
  by: string;
  giftId?: string;
  /** For steals and swaps: who lost the gift. */
  from?: string;
  turn: number;
}

export interface LiveState {
  players: LivePlayer[];
  turnOrder: string[];
  /** Index into turnOrder of whose numbered turn it is. */
  turnIndex: number;
  /** Who must act right now: the turn owner, or whoever was just stolen from. */
  actor: string | null;
  phase: LivePhase;
  gifts: Gift[];
  /** The player just stolen from may not immediately steal that same gift back. */
  noStealBack: { giftId: string; playerId: string } | null;
  seq: number;
  events: GameEvent[];
  /** Snapshots for the host's undo button (newest last). */
  undo: Omit<LiveState, "undo">[];
}

/** What a phone can ask for. The server works out who is acting and fills in secrets. */
export type ClientAction =
  | { type: "open"; label: string; broughtBy: string }
  | { type: "steal"; giftId: string }
  | { type: "finalSwap"; giftId: string | null }
  | { type: "vote"; giftId: string; vote: Vote | null }
  | { type: "end" }
  | { type: "undo" };

/** Live state as sent to phones (no undo history). */
export type PublicLiveState = Omit<LiveState, "undo"> & { canUndo: boolean };

export type GameStatus = "lobby" | "live" | "ended";

// ---- What the API sends to a phone ----

export interface PublicPlayer {
  id: string;
  name: string;
  isHost: boolean;
  rerollsLeft: number;
}

export interface GameView {
  code: string;
  status: GameStatus;
  settings: GameSettings;
  players: PublicPlayer[];
  expiresAt: string;
  version: number;
  isHost: boolean;
  live: PublicLiveState | null;
  /** Only present for the player asking. Nobody else's challenge is ever sent. */
  me: { id: string; name: string; challenge: Challenge; rerollsLeft: number } | null;
}
