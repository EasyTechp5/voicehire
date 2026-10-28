// Optional natural voice. Enabled when OPENAI_API_KEY is set; otherwise the browser voice is used.
export const maxDuration = 30;

export async function GET() {
  return Response.json({ available: !!process.env.OPENAI_API_KEY });
}

export async function POST(req: Request) {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return Response.json({ error: "TTS not configured" }, { status: 501 });
  const { text } = await req.json();
  if (!text || String(text).length > 800) return Response.json({ error: "Bad text" }, { status: 400 });
  // tts-1 starts audio much faster than the gpt-4o TTS models; override with TTS_MODEL if you prefer quality.
  const model = process.env.TTS_MODEL || "tts-1";
  const r = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      voice: process.env.TTS_VOICE || "nova",
      input: String(text),
      response_format: "mp3",
      ...(model.startsWith("gpt-4o")
        ? { instructions: "Warm, calm, professional interviewer. Natural pacing, friendly but neutral." }
        : {}),
    }),
  });
  if (!r.ok || !r.body) return Response.json({ error: "TTS failed" }, { status: 502 });
  return new Response(r.body, { headers: { "content-type": "audio/mpeg", "cache-control": "no-store" } });
}
