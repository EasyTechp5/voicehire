import { sb } from "@/lib/supabase";
import type { Turn } from "@/lib/types";

// Candidate-side autosave. The interview id (an unguessable UUID) is the capability.
export async function POST(req: Request, ctx: RouteContext<"/api/interviews/[id]/turns">) {
  const { id } = await ctx.params;
  const { turns, started } = (await req.json()) as { turns: Turn[]; started?: boolean };
  const { data: iv } = await sb().from("interviews").select("status").eq("id", id).maybeSingle();
  if (!iv) return Response.json({ error: "Not found" }, { status: 404 });
  if (iv.status === "completed" || iv.status === "scoring") return Response.json({ ok: true });
  if (started) {
    await sb().from("interviews").update({ status: "in_progress", started_at: new Date().toISOString() }).eq("id", id);
    await sb().from("event_logs").insert({ interview_id: id, event_type: "started", payload: {} });
  }
  if (turns?.length) {
    const rows = turns.slice(0, 400).map((t, i) => ({
      interview_id: id,
      turn_index: i,
      speaker: t.speaker,
      text: String(t.text || "").slice(0, 6000),
      at_ms: Math.max(0, Math.round(t.at || 0)),
    })).filter((r) => r.text);
    const { error } = await sb().from("transcript_turns").upsert(rows, { onConflict: "interview_id,turn_index" });
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }
  return Response.json({ ok: true });
}
