import { client, noKey, CONVERSATION_MODEL } from "@/lib/claude";

export const maxDuration = 60;

// Extracts plain text from an uploaded PDF (JD or résumé) using Claude's PDF input.
export async function POST(req: Request) {
  const c = client();
  if (!c) return noKey();
  const { pdfBase64, kind } = await req.json();
  if (!pdfBase64) return Response.json({ error: "No file." }, { status: 400 });
  try {
    const res = await c.messages.create({
      model: CONVERSATION_MODEL,
      max_tokens: 6000,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
            },
            {
              type: "text",
              text: `Transcribe the text of this ${kind === "jd" ? "job description" : "résumé"} faithfully as plain text. Keep section headings and bullet points. Output only the text.`,
            },
          ],
        },
      ],
    });
    const text = res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    return Response.json({ text });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
