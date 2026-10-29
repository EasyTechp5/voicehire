import { isAdmin, unauthorized } from "@/lib/auth";
import { sb } from "@/lib/supabase";
import { jobFromRow, jobToRow } from "@/lib/db";
import type { Job } from "@/lib/types";

export async function GET() {
  if (!(await isAdmin())) return unauthorized();
  const { data, error } = await sb().from("jobs").select("*").order("created_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ jobs: data.map(jobFromRow) });
}

export async function POST(req: Request) {
  if (!(await isAdmin())) return unauthorized();
  const job = (await req.json()) as Job;
  if (!job.id || !job.title) return Response.json({ error: "Missing job id or title" }, { status: 400 });
  const { error } = await sb().from("jobs").upsert(jobToRow(job));
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ ok: true });
}
