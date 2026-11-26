// Shared types used by the server, the client, and the pure game logic.

export type Difficulty = "easy" | "normal" | "chaos";

/** The kinds of gift challenge a host can switch on or off. */
export type ChallengeType = "category" | "letter" | "constraint";

export const CHALLENGE_TYPES: ChallengeType[] = ["category", "letter", "constraint"];

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
  | { kind: "swapAny"; who: "previous" | "random" }
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
  /** Total times stolen (used for "Most Stolen"). */
  stealCount: number;
  /** Steals that don't count toward the lock (free steals, amnesty). Locked when stealCount - lockOffset >= limit. */
  lockOffset?: number;
  openedAtTurn: number;
  /** Copied from the bringer when opened, so it's public from then on. */
  challenge: Challenge;
  votes: Record<string, Vote>;
}

/** "bonusSwap" is a mid-game swap granted by a twist; "finalSwap" is the finale. */
export type LivePhase = "turns" | "bonusSwap" | "finalSwap" | "ended";

/** One-move rules set by twists; cleared after the next open or steal. */
export interface Modifiers {
  mustOpen?: boolean;
  mustSteal?: boolean;
  freeSteal?: boolean;
  blindPick?: boolean;
}

export interface GameEvent {
  seq: number;
  kind: "start" | "open" | "steal" | "swap" | "keep" | "end" | "undo" | "twist";
  twistId?: string;
  /** For twists: a short note on what happened, e.g. who got the bonus swap. */
  note?: string;
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
  // ---- Twists (Phase 3) ----
  modifiers?: Modifiers;
  /** Turns left during which nobody can steal. */
  stealLockTurns?: number;
  /** Where play resumes after a twist's bonus swap. */
  resumeActor?: string | null;
  // ---- Stats for awards ----
  stats?: { steals: Record<string, number>; stolenFrom: Record<string, number> };
  /** End-of-game "Most Creative Interpretation" ballot: voter → gift. */
  creativeVotes?: Record<string, string>;
  seq: number;
  events: GameEvent[];
  /** Snapshots for the host's undo button (newest last). */
  undo: Omit<LiveState, "undo">[];
}

/** What a phone can ask for. The server works out who is acting and fills in secrets. */
export type ClientAction =
  | { type: "open"; label: string; broughtBy: string }
  | { type: "steal"; giftId: string }
  | { type: "swap"; giftId: string | null }
  | { type: "vote"; giftId: string; vote: Vote | null }
  | { type: "creativeVote"; giftId: string | null }
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
