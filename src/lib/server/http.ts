import "server-only";
import { GameError, type Credentials } from "./games";

export const PLAYER_TOKEN_HEADER = "x-player-token";
export const HOST_TOKEN_HEADER = "x-host-token";

export function credentials(req: Request): Credentials {
  return { playerToken: req.headers.get(PLAYER_TOKEN_HEADER), hostToken: req.headers.get(HOST_TOKEN_HEADER) };
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const body = await req.json();
    return typeof body === "object" && body !== null ? body : {};
  } catch {
    return {};
  }
}

/** Runs a handler and turns GameErrors into JSON error responses. */
export async function handle(fn: () => Promise<unknown>): Promise<Response> {
  try {
    const result = await fn();
    return Response.json(result ?? { ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    if (err instanceof GameError) return Response.json({ error: err.message }, { status: err.status });
    console.error(err);
    return Response.json({ error: "Something went wrong. Try again?" }, { status: 500 });
  }
}
