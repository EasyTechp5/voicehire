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

/** Streams plain text deltas as a Response body. Errors are logged and signalled in-band as <<ERR>>. */
export function streamText(opts: { model: string; system: string; user: string; maxTokens: number }) {
  const c = client();
  if (!c) return noKey();
  const enc = new TextEncoder();
  let aborter: (() => void) | null = null;
  return new Response(
    new ReadableStream({
      async start(ctrl) {
        for (let attempt = 1; attempt <= 2; attempt++) {
          let sent = false;
          try {
            const stream = c.messages.stream({
              model: opts.model,
              max_tokens: opts.maxTokens,
              system: opts.system,
              messages: [{ role: "user", content: opts.user }],
            });
            aborter = () => stream.abort();
            for await (const ev of stream) {
              if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") {
                sent = true;
                ctrl.enqueue(enc.encode(ev.delta.text));
              }
            }
            if (sent) return ctrl.close();
            console.error(`[turn] empty completion (attempt ${attempt}), stop_reason=${(await stream.finalMessage()).stop_reason}`);
          } catch (e) {
            console.error(`[turn] stream error (attempt ${attempt}):`, (e as Error).message);
            if (sent) break; // already partially spoken; don't restart
          }
        }
        ctrl.enqueue(enc.encode("<<ERR>>"));
        ctrl.close();
      },
      cancel() { aborter?.(); },
    }),
    { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } },
  );
}
