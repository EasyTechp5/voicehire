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
  if (process.env.ANTHROPIC_API_KEY) {
    const t = Date.now();
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": process.env.ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: process.env.CONVERSATION_MODEL || "claude-haiku-5-5", max_tokens: 20, messages: [{ role: "user", content: "Say hello in five words." }] }),
    }).catch((e) => ({ ok: false, status: 0, text: async () => (e as Error).message, headers: new Headers(), json: async () => ({}) }) as unknown as Response);
    const body = await r.text();
    out.anthropic = {
      status: r.status, ms: Date.now() - t,
      requestsRemaining: r.headers.get("anthropic-ratelimit-requests-remaining"),
      requestsLimit: r.headers.get("anthropic-ratelimit-requests-limit"),
      tokensRemaining: r.headers.get("anthropic-ratelimit-tokens-remaining"),
      body: body.slice(0, 300),
    };
  }
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
