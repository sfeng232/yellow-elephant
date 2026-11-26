import { removePlayer } from "@/lib/server/games";
import { credentials, handle } from "@/lib/server/http";

export async function DELETE(req: Request, ctx: RouteContext<"/api/games/[code]/players/[playerId]">) {
  const { code, playerId } = await ctx.params;
  return handle(() => removePlayer(code, credentials(req), playerId));
}
