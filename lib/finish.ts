import { sb } from "./supabase";
import { jobFromRow, turnFromRow } from "./db";
import { scoreInterview } from "./scoring";

/** Loads the saved transcript, scores it, and stores the result. Used on finish and for admin re-scoring. */
export async function runScoring(id: string) {
  const { data: row } = await sb().from("interviews").select("*").eq("id", id).maybeSingle();
  if (!row) return { ok: false as const, error: "Interview not found" };
  const { data: jobRow } = row.job_id ? await sb().from("jobs").select("*").eq("id", row.job_id).maybeSingle() : { data: null };
  if (!jobRow) return { ok: false as const, error: "The job for this interview no longer exists" };
  const { data: turns } = await sb().from("transcript_turns").select("*").eq("interview_id", id).order("turn_index");
  await sb().from("interviews").update({ status: "scoring", error: null }).eq("id", id);
  try {
    const { answers, report } = await scoreInterview(jobFromRow(jobRow), row.plan ?? [], (turns ?? []).map(turnFromRow));
    await sb()
      .from("interviews")
      .update({ status: "completed", answer_scores: answers, report, overall_score: report.overall, needs_review: report.needsReview, error: null })
      .eq("id", id);
    await sb().from("event_logs").insert({ interview_id: id, event_type: "scored", payload: { model: report.model, overall: report.overall } });
    return { ok: true as const, report };
  } catch (e) {
    const msg = (e as Error).message;
    await sb().from("interviews").update({ status: "failed", error: msg }).eq("id", id);
    await sb().from("event_logs").insert({ interview_id: id, event_type: "scoring_failed", payload: { error: msg } });
    return { ok: false as const, error: msg };
  }
}
