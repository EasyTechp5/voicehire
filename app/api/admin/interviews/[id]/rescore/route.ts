import { isAdmin, unauthorized } from "@/lib/auth";
import { runScoring } from "@/lib/finish";

export const maxDuration = 120;

export async function POST(_: Request, ctx: RouteContext<"/api/admin/interviews/[id]/rescore">) {
  if (!(await isAdmin())) return unauthorized();
  const { id } = await ctx.params;
  const r = await runScoring(id);
  return Response.json(r, { status: r.ok ? 200 : 500 });
}
