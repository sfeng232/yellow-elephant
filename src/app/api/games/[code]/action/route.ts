import { parseClientAction, performAction } from "@/lib/server/games";
import { credentials, handle, readJson } from "@/lib/server/http";

export async function POST(req: Request, ctx: RouteContext<"/api/games/[code]/action">) {
  const { code } = await ctx.params;
  return handle(async () => performAction(code, credentials(req), parseClientAction(await readJson(req))));
}
