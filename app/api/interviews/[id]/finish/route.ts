import { sb } from "@/lib/supabase";
import { runScoring } from "@/lib/finish";
import type { Turn } from "@/lib/types";

export const maxDuration = 120;

export async function POST(req: Request, ctx: RouteContext<"/api/interviews/[id]/finish">) {
  const { id } = await ctx.params;
  const { turns, durationSec, abandoned, hasAudio } = (await req.json()) as {
    turns: Turn[]; durationSec: number; abandoned: boolean; hasAudio: boolean;
  };
  const { data: iv } = await sb().from("interviews").select("status,job_id").eq("id", id).maybeSingle();
  if (!iv) return Response.json({ error: "Not found" }, { status: 404 });
  if (iv.status === "completed" || iv.status === "scoring") return Response.json({ status: iv.status });

  if (turns?.length) {
    const rows = turns.slice(0, 400).map((t, i) => ({
      interview_id: id, turn_index: i, speaker: t.speaker,
      text: String(t.text || "").slice(0, 6000), at_ms: Math.max(0, Math.round(t.at || 0)),
    })).filter((r) => r.text);
    await sb().from("transcript_turns").upsert(rows, { onConflict: "interview_id,turn_index" });
  }
  const answered = (turns || []).filter((t) => t.speaker === "candidate").length;
  await sb().from("interviews").update({
    ended_at: new Date().toISOString(),
    duration_seconds: Math.round(durationSec || 0),
    recording_path: hasAudio ? `interviews/${id}.webm` : null,
  }).eq("id", id);
  await sb().from("event_logs").insert({ interview_id: id, event_type: abandoned ? "abandoned" : "finished", payload: { answered, durationSec } });

  if (abandoned && answered < 2) {
    await sb().from("interviews").update({ status: "abandoned" }).eq("id", id);
    return Response.json({ status: "abandoned" });
  }
  const r = await runScoring(id);
  // Candidates only ever receive feedback if the job is in practice mode.
  let feedback: { strengths: string[]; concerns: string[] } | null = null;
  if (r.ok) {
    const { data: job } = await sb().from("jobs").select("settings").eq("id", iv.job_id).maybeSingle();
    if (job?.settings?.practiceMode) feedback = { strengths: r.report.strengths, concerns: r.report.concerns };
  }
  return Response.json({ status: r.ok ? "completed" : "failed", feedback });
}
