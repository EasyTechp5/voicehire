import { sb } from "@/lib/supabase";

// Only safe fields: candidates never receive the rubric.
export async function GET() {
  const { data, error } = await sb()
    .from("jobs")
    .select("id,title,department,seniority,settings")
    .eq("rubric_approved", true)
    .order("created_at", { ascending: false });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ jobs: data });
}
