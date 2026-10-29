import { isAdmin, unauthorized } from "@/lib/auth";
import { sb, RECORDINGS } from "@/lib/supabase";
import { interviewFromRow, turnFromRow, jobFromRow } from "@/lib/db";

export async function GET(_: Request, ctx: RouteContext<"/api/admin/interviews/[id]">) {
  if (!(await isAdmin())) return unauthorized();
  const { id } = await ctx.params;
  const { data: row } = await sb().from("interviews").select("*").eq("id", id).maybeSingle();
  if (!row) return Response.json({ error: "Not found" }, { status: 404 });
  const [{ data: turns }, { data: job }] = await Promise.all([
    sb().from("transcript_turns").select("*").eq("interview_id", id).order("turn_index"),
    row.job_id ? sb().from("jobs").select("*").eq("id", row.job_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  let audioUrl: string | null = null;
  if (row.recording_path) {
    const { data } = await sb().storage.from(RECORDINGS).createSignedUrl(row.recording_path, 3600);
    audioUrl = data?.signedUrl ?? null;
  }
  return Response.json({
    interview: interviewFromRow(row, (turns ?? []).map(turnFromRow)),
    job: job ? jobFromRow(job) : null,
    audioUrl,
  });
}

export async function PATCH(req: Request, ctx: RouteContext<"/api/admin/interviews/[id]">) {
  if (!(await isAdmin())) return unauthorized();
  const { id } = await ctx.params;
  const { adminNote } = await req.json();
  const { error } = await sb().from("interviews").update({ admin_note: String(adminNote ?? "") }).eq("id", id);
  await sb().from("event_logs").insert({ interview_id: id, event_type: "admin_note", payload: {} });
  return error ? Response.json({ error: error.message }, { status: 500 }) : Response.json({ ok: true });
}

export async function DELETE(_: Request, ctx: RouteContext<"/api/admin/interviews/[id]">) {
  if (!(await isAdmin())) return unauthorized();
  const { id } = await ctx.params;
  const { data } = await sb().from("interviews").select("recording_path").eq("id", id).maybeSingle();
  if (data?.recording_path) await sb().storage.from(RECORDINGS).remove([data.recording_path]);
  const { error } = await sb().from("interviews").delete().eq("id", id);
  return error ? Response.json({ error: error.message }, { status: 500 }) : Response.json({ ok: true });
}
