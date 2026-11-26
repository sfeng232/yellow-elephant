import { rerollMyChallenge } from "@/lib/server/games";
import { credentials, handle } from "@/lib/server/http";

export async function POST(req: Request, ctx: RouteContext<"/api/games/[code]/reroll">) {
  const { code } = await ctx.params;
  return handle(() => rerollMyChallenge(code, credentials(req)));
}
