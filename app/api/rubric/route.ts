import { ask, client, extractJson, noKey, SCORING_MODEL } from "@/lib/claude";
import type { Competency } from "@/lib/types";
import { isAdmin, unauthorized } from "@/lib/auth";

export const maxDuration = 60;

export async function POST(req: Request) {
  if (!(await isAdmin())) return unauthorized();
  if (!client()) return noKey();
  const { title, seniority, jdText } = await req.json();
  if (!jdText || String(jdText).length < 30)
    return Response.json({ error: "Job description is too short." }, { status: 400 });
  try {
    const out = await ask({
      model: SCORING_MODEL,
      maxTokens: 2500,
      system:
        "You design structured interview scoring rubrics. Reply with JSON only, no prose.",
      user: `Draft a scoring rubric for a first-round screening interview.

Role: ${title} (${seniority})
Job description:
"""
${String(jdText).slice(0, 12000)}
"""

Return: {"competencies":[{"name":string,"weight":number,"five":string,"one":string}]}
Rules: 5 to 8 competencies tied to the job description; weights are integers summing to exactly 100; "five" = what a 5/5 answer looks like; "one" = what a 1/5 answer looks like; keep each description under 20 words. Do not include anything about protected characteristics.`,
    });
    const { competencies } = extractJson<{ competencies: Competency[] }>(out);
    return Response.json({ competencies });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 500 });
  }
}
