import { sb } from "@/lib/supabase";
import { jobFromRow } from "@/lib/db";
import { makePlan } from "@/lib/planning";
import { client, noKey } from "@/lib/claude";

export const maxDuration = 90;

export async function POST(req: Request) {
  if (!client()) return noKey();
  const b = await req.json();
  const name = String(b.name || "").trim().slice(0, 120);
  const email = String(b.email || "").trim().slice(0, 200);
  const resume = String(b.resumeText || "").slice(0, 20000);
  if (!name || !/\S+@\S+/.test(email) || resume.length < 30 || !b.consent)
    return Response.json({ error: "Missing details or consent." }, { status: 400 });
  const { data: jobRow } = await sb().from("jobs").select("*").eq("id", b.jobId).eq("rubric_approved", true).maybeSingle();
  if (!jobRow) return Response.json({ error: "This interview is not open." }, { status: 404 });
  try {
    const plan = await makePlan(jobFromRow(jobRow), resume);
    const { data, error } = await sb()
      .from("interviews")
      .insert({ job_id: jobRow.id, candidate_name: name, candidate_email: email, resume_text: resume, plan, status: "scheduled" })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await sb().from("event_logs").insert({ interview_id: data.id, event_type: "consent_and_created", payload: { at: new Date().toISOString() } });
    return Response.json({ id: data.id });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
