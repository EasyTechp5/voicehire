import { isAdmin, unauthorized } from "@/lib/auth";
import { sb } from "@/lib/supabase";
import { jobFromRow } from "@/lib/db";

export async function GET(_: Request, ctx: RouteContext<"/api/admin/jobs/[id]">) {
  if (!(await isAdmin())) return unauthorized();
  const { id } = await ctx.params;
  const { data } = await sb().from("jobs").select("*").eq("id", id).maybeSingle();
  return data ? Response.json({ job: jobFromRow(data) }) : Response.json({ error: "Not found" }, { status: 404 });
}

export async function DELETE(_: Request, ctx: RouteContext<"/api/admin/jobs/[id]">) {
  if (!(await isAdmin())) return unauthorized();
  const { id } = await ctx.params;
  const { error } = await sb().from("jobs").delete().eq("id", id);
  return error ? Response.json({ error: error.message }, { status: 500 }) : Response.json({ ok: true });
}
