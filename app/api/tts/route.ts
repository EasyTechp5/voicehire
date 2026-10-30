// Optional natural voice. Enabled when OPENAI_API_KEY is set; otherwise the browser voice is used.
export const maxDuration = 30;

export async function GET() {
  return Response.json({ available: !!(process.env.DEEPGRAM_API_KEY || process.env.OPENAI_API_KEY) });
}

// Deepgram Aura answers in a few hundred ms (OpenAI tts-1 has ~1.5s of fixed delay), so prefer it when configured.
async function deepgram(text: string, fmt: "mp3" | "pcm") {
  const model = process.env.DEEPGRAM_TTS_MODEL || "aura-2-thalia-en";
  const q = fmt === "mp3" ? "encoding=mp3" : "encoding=linear16&sample_rate=24000&container=none";
  for (const ms of [5000, 7000]) {
    try {
      const r = await fetch(`https://api.deepgram.com/v1/speak?model=${model}&${q}`, {
        method: "POST",
        headers: { authorization: `Token ${process.env.DEEPGRAM_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({ text }),
        signal: AbortSignal.timeout(ms),
      });
      if (r.ok && r.body) return r;
      console.error(`[tts] deepgram status ${r.status}`);
    } catch {
      console.error("[tts] deepgram attempt failed");
    }
  }
  return null;
}

export async function POST(req: Request) {
  const key = process.env.OPENAI_API_KEY;
  if (!key && !process.env.DEEPGRAM_API_KEY) return Response.json({ error: "TTS not configured" }, { status: 501 });
  const { text, format } = await req.json();
  // "pcm" (24 kHz, 16-bit mono) can be played while it is still being generated; "mp3" is used for the short filler clips.
  const fmt = format === "mp3" ? "mp3" : "pcm";
  if (!text || String(text).length > 800) return Response.json({ error: "Bad text" }, { status: 400 });
  const headers = { "content-type": fmt === "mp3" ? "audio/mpeg" : "application/octet-stream", "cache-control": "no-store" };
  if (process.env.DEEPGRAM_API_KEY) {
    const r = await deepgram(String(text), fmt);
    if (r) return new Response(r.body, { headers });
    if (!key) return Response.json({ error: "Voice service error 502" }, { status: 502 });
  }
  // tts-1 starts audio much faster than the gpt-4o TTS models; override with TTS_MODEL if you prefer quality.
  const model = process.env.TTS_MODEL || "tts-1";
  const body = JSON.stringify({
    model,
    voice: process.env.TTS_VOICE || "nova",
    input: String(text),
    response_format: fmt,
    ...(model.startsWith("gpt-4o")
      ? { instructions: "Warm, calm, professional interviewer. Natural pacing, friendly but neutral." }
      : {}),
  });
  // OpenAI occasionally stalls; give up fast and retry once instead of hanging until the platform timeout.
  let lastStatus = 0;
  for (const ms of [6000, 8000]) {
    try {
      const r = await fetch("https://api.openai.com/v1/audio/speech", {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body,
        signal: AbortSignal.timeout(ms),
      });
      if (r.ok && r.body) return new Response(r.body, { headers: { "content-type": fmt === "mp3" ? "audio/mpeg" : "application/octet-stream", "cache-control": "no-store" } });
      lastStatus = r.status;
      if (r.status === 429) {
        const detail = (await r.text().catch(() => "")).slice(0, 200);
        return Response.json({ error: "Voice service error 429", detail }, { status: 429 });
      }
    } catch {
      lastStatus = 504;
    }
    console.error(`[tts] attempt failed (status ${lastStatus})`);
  }
  return Response.json({ error: `Voice service error ${lastStatus}` }, { status: lastStatus === 504 ? 504 : 502 });
}
