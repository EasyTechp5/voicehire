import Anthropic from "@anthropic-ai/sdk";

// Fast model talks, strong model judges (PRD §10).
export const CONVERSATION_MODEL = process.env.CONVERSATION_MODEL || "claude-haiku-5-5";
export const SCORING_MODEL = process.env.SCORING_MODEL || "claude-opus-5-5";

export const PROMPT_VERSION = "v1";

export function client() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  return new Anthropic({ apiKey: key });
}

export const noKey = () =>
  Response.json(
    { error: "AI is not configured yet. Set ANTHROPIC_API_KEY on the server." },
    { status: 503 },
  );

export function extractJson<T>(text: string): T {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < 0) throw new Error("Model did not return JSON");
  return JSON.parse(text.slice(start, end + 1)) as T;
}

export async function ask(opts: {
  model: string;
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<string> {
  const c = client();
  if (!c) throw new Error("no key");
  const res = await c.messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens ?? 2000,
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
  });
  return res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
}

/** Streams plain text deltas as a Response body. */
export function streamText(opts: { model: string; system: string; user: string; maxTokens: number }) {
  const c = client();
  if (!c) return noKey();
  const stream = c.messages.stream({
    model: opts.model,
    max_tokens: opts.maxTokens,
    system: opts.system,
    messages: [{ role: "user", content: opts.user }],
  });
  const enc = new TextEncoder();
  return new Response(
    new ReadableStream({
      async start(ctrl) {
        try {
          for await (const ev of stream) {
            if (ev.type === "content_block_delta" && ev.delta.type === "text_delta")
              ctrl.enqueue(enc.encode(ev.delta.text));
          }
          ctrl.close();
        } catch (e) {
          ctrl.error(e);
        }
      },
      cancel() { stream.abort(); },
    }),
    { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } },
  );
}
