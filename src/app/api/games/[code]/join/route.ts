import { joinGame } from "@/lib/server/games";
import { handle, readJson } from "@/lib/server/http";

export async function POST(req: Request, ctx: RouteContext<"/api/games/[code]/join">) {
  const { code } = await ctx.params;
  return handle(async () => joinGame(code, await readJson(req)));
}
