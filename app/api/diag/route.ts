// Health check for the voice providers. Never returns key material.
export const maxDuration = 30;

async function probe(url: string, init: RequestInit) {
  const t = Date.now();
  try {
    const r = await fetch(url, init);
    const h = (n: string) => r.headers.get(n);
    let message = "";
    if (!r.ok) message = (await r.text()).slice(0, 300);
    return {
      status: r.status,
      ms: Date.now() - t,
      rateLimit: {
        requestsLimit: h("x-ratelimit-limit-requests"),
        requestsRemaining: h("x-ratelimit-remaining-requests"),
        resetRequests: h("x-ratelimit-reset-requests"),
      },
      message,
    };
  } catch (e) {
    return { status: 0, ms: Date.now() - t, message: (e as Error).message };
  }
}

export async function GET() {
  const key = process.env.OPENAI_API_KEY;
  const out: Record<string, unknown> = {
    anthropicKey: !!process.env.ANTHROPIC_API_KEY,
    openaiKey: !!key,
    ttsModel: process.env.TTS_MODEL || "tts-1",
    sttModel: process.env.STT_MODEL || "gpt-4o-mini-transcribe",
  };
  if (key) {
    out.tts = await probe("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
      body: JSON.stringify({ model: process.env.TTS_MODEL || "tts-1", voice: "nova", input: "Hi.", response_format: "mp3" }),
    });
    out.models = await probe("https://api.openai.com/v1/models", { headers: { authorization: `Bearer ${key}` } });
  }
  return Response.json(out);
}
