import { sb, RECORDINGS } from "@/lib/supabase";

// Returns a one-time signed upload URL so the browser can send the recording straight to private storage.
export async function POST(_: Request, ctx: RouteContext<"/api/interviews/[id]/audio">) {
  const { id } = await ctx.params;
  const { data: iv } = await sb().from("interviews").select("status,recording_path").eq("id", id).maybeSingle();
  if (!iv || iv.status === "completed") return Response.json({ error: "Not allowed" }, { status: 403 });
  const path = `interviews/${id}.webm`;
  const { data, error } = await sb().storage.from(RECORDINGS).createSignedUploadUrl(path, { upsert: true });
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ path, token: data.token });
}
