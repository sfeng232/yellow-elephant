import { getGameView } from "@/lib/server/games";
import { credentials, handle } from "@/lib/server/http";

export async function GET(req: Request, ctx: RouteContext<"/api/games/[code]">) {
  const { code } = await ctx.params;
  return handle(() => getGameView(code, credentials(req)));
}
