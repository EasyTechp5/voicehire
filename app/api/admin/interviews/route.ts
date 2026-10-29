import { isAdmin, unauthorized } from "@/lib/auth";
import { sb } from "@/lib/supabase";
import { interviewFromRow } from "@/lib/db";

export async function GET(req: Request) {
  if (!(await isAdmin())) return unauthorized();
  const q = new URL(req.url).searchParams.get("q")?.trim();
  let ids: string[] | null = null;
  if (q) {
    // Search what candidates said (full-text), plus name/email below.
    const { data } = await sb()
      .from("transcript_turns")
      .select("interview_id")
      .textSearch("text", q, { type: "websearch", config: "english" })
      .limit(500);
    ids = [...new Set((data ?? []).map((r) => r.interview_id as string))];
  }
  let query = sb()
    .from("interviews")
    .select("id,job_id,candidate_name,candidate_email,status,report,consent_at,started_at,ended_at,duration_seconds,recording_path,plan,answer_scores,resume_text,admin_note,error")
    .order("created_at", { ascending: false })
    .limit(300);
  if (q) {
    const like = `%${q.replace(/[%,()]/g, " ")}%`;
    const parts = [`candidate_name.ilike.${like}`, `candidate_email.ilike.${like}`];
    if (ids?.length) parts.push(`id.in.(${ids.join(",")})`);
    query = query.or(parts.join(","));
  }
  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ interviews: data.map((r) => interviewFromRow(r)) });
}
