import { startGame } from "@/lib/server/games";
import { credentials, handle } from "@/lib/server/http";

export async function POST(req: Request, ctx: RouteContext<"/api/games/[code]/start">) {
  const { code } = await ctx.params;
  return handle(() => startGame(code, credentials(req)));
}
