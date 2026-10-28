// Server-side speech-to-text (works in every browser). Enabled when OPENAI_API_KEY is set.
export const maxDuration = 30;

export async function GET() {
  return Response.json({ available: !!process.env.OPENAI_API_KEY });
}

export async function POST(req: Request) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return Response.json({ error: "STT not configured" }, { status: 501 });
  const buf = await req.arrayBuffer();
  if (buf.byteLength < 4000 || buf.byteLength > 8_000_000)
    return Response.json({ text: "" });
  const form = new FormData();
  form.append("file", new Blob([buf], { type: "audio/wav" }), "speech.wav");
  form.append("model", process.env.STT_MODEL || "gpt-4o-mini-transcribe");
  form.append("language", "en");
  form.append("prompt", "A candidate answering job interview questions.");
  const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { authorization: `Bearer ${key}` },
    body: form,
  });
  if (!r.ok) return Response.json({ error: "Transcription failed" }, { status: 502 });
  let text = String((await r.json()).text || "").trim();
  // Models hallucinate stock phrases on near-silence; drop them for very short clips.
  if (buf.byteLength < 48000 && /^(thank you\.?|thanks for watching\.?|you\.?|bye\.?)$/i.test(text)) text = "";
  return Response.json({ text });
}
