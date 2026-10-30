// Server-side speech-to-text (works in every browser). Enabled when OPENAI_API_KEY is set.
export const maxDuration = 30;

export async function GET() {
  return Response.json({ available: !!(process.env.DEEPGRAM_API_KEY || process.env.OPENAI_API_KEY) });
}

const STOCK = /^(thank you\.?|thanks for watching\.?|you\.?|bye\.?)$/i;

export async function POST(req: Request) {
  const key = process.env.OPENAI_API_KEY;
  if (!key && !process.env.DEEPGRAM_API_KEY) return Response.json({ error: "STT not configured" }, { status: 501 });
  const buf = await req.arrayBuffer();
  if (buf.byteLength < 4000 || buf.byteLength > 8_000_000)
    return Response.json({ text: "" });
  // Deepgram nova transcribes a short clip in a few hundred ms (vs ~1s for OpenAI), so prefer it when configured.
  if (process.env.DEEPGRAM_API_KEY) {
    try {
      const d = await fetch(
        `https://api.deepgram.com/v1/listen?model=${process.env.DEEPGRAM_STT_MODEL || "nova-3"}&language=en&smart_format=true`,
        {
          method: "POST",
          headers: { authorization: `Token ${process.env.DEEPGRAM_API_KEY}`, "content-type": "audio/wav" },
          body: buf,
          signal: AbortSignal.timeout(8000),
        },
      );
      if (d.ok) {
        let t = String((await d.json())?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "").trim();
        if (buf.byteLength < 48000 && STOCK.test(t)) t = "";
        return Response.json({ text: t });
      }
      console.error(`[stt] deepgram status ${d.status}`);
    } catch {
      console.error("[stt] deepgram attempt failed");
    }
    if (!key) return Response.json({ error: "Transcription error 502" }, { status: 502 });
  }
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
  if (!r.ok) {
    const detail = (await r.text().catch(() => "")).slice(0, 200);
    return Response.json({ error: `Transcription error ${r.status}`, detail }, { status: r.status === 429 ? 429 : 502 });
  }
  let text = String((await r.json()).text || "").trim();
  // Models hallucinate stock phrases on near-silence; drop them for very short clips.
  if (buf.byteLength < 48000 && STOCK.test(text)) text = "";
  return Response.json({ text });
}
