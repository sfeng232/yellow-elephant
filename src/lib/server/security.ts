import "server-only";
import { createHash, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

/** No vowels (so codes can't spell words) and no look-alikes like 0/O or 1/I. */
const CODE_ALPHABET = "BCDFGHJKLMNPQRSTVWXZ23456789";
export const CODE_LENGTH = 5;

export function newJoinCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

export function normalizeCode(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, CODE_LENGTH);
}

export function newToken(): string {
  return randomBytes(24).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function tokenMatches(token: string | null | undefined, hash: string): boolean {
  if (!token) return false;
  const a = Buffer.from(hashToken(token), "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
