import { createGame } from "@/lib/server/games";
import { handle, readJson } from "@/lib/server/http";

export async function POST(req: Request) {
  return handle(async () => createGame(await readJson(req)));
}
