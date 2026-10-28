"use client";
import { Suspense } from "react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Header } from "@/components/Header";
import { audioStore, interviewsStore, jobsStore } from "@/lib/store";
import { resultLabel, type Interview } from "@/lib/types";

const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;

function InterviewDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [iv, setIv] = useState<Interview | null | undefined>(undefined);
  const [audioUrl, setAudioUrl] = useState("");
  const [note, setNote] = useState("");
  const audio = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const i = interviewsStore.get(id) ?? null;
    setIv(i);
    setNote(i?.adminNote ?? "");
    let url = "";
    audioStore.get(id).then((b) => {
      if (b) setAudioUrl((url = URL.createObjectURL(b)));
    });
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [id]);

  if (iv === undefined) return null;
  if (iv === null)
    return (<><Header area="admin" /><main className="p-8">Interview not found on this device.</main></>);

  const job = jobsStore.get(iv.jobId);
  const r = iv.report;

  async function rescore() {
    if (!job || !iv) return;
    const upd = { ...iv, status: "scoring" as const, error: undefined };
    interviewsStore.save(upd);
    setIv(upd);
    const res = await fetch("/api/score", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ job, plan: iv.plan, turns: iv.turns }),
    });
    const j = await res.json();
    const next: Interview = res.ok
      ? { ...upd, status: "completed", answerScores: j.answers, report: j.report }
      : { ...upd, status: "failed", error: j.error };
    interviewsStore.save(next);
    setIv(next);
  }

  return (
    <>
      <Header area="admin" />
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-5 py-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{iv.candidateName}</h1>
            <p className="text-sm text-neutral-500">{iv.candidateEmail} · {job?.title ?? "Deleted job"} · {iv.status.replace("_", " ")}{iv.durationSec != null && ` · ${Math.floor(iv.durationSec / 60)}m ${iv.durationSec % 60}s`}</p>
          </div>
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={rescore} disabled={iv.turns.length < 2}>Re-score</button>
            <button className="btn-ghost" onClick={async () => { if (confirm("Delete this interview and its recording?")) { await interviewsStore.remove(iv.id); router.push("/admin"); } }}>Delete</button>
          </div>
        </div>
        {iv.error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">Scoring error: {iv.error}</p>}
        {iv.status === "scoring" && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Scoring in progress…</p>}

        {r && (
          <section className="grid gap-4 lg:grid-cols-3">
            <div className="card">
              <div className="text-sm text-neutral-500">Overall score</div>
              <div className="mt-1 text-5xl font-semibold">{r.overall}<span className="text-lg text-neutral-400">/100</span></div>
              <div className="mt-1 font-medium">{resultLabel(r.overall)}</div>
              {r.needsReview && <div className="mt-2 inline-block rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-800">Needs human review</div>}
              <p className="mt-3 text-xs text-neutral-500">Model: {r.model}. Assists a human decision; never the sole basis for rejection.</p>
            </div>
            <div className="card lg:col-span-2">
              <h2 className="font-semibold">Summary</h2>
              <p className="mt-1 text-sm text-neutral-700">{r.summary}</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 text-sm">
                <div><h3 className="font-medium text-green-700">Strengths</h3><ul className="mt-1 list-disc pl-5">{r.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
                <div><h3 className="font-medium text-red-700">Concerns</h3><ul className="mt-1 list-disc pl-5">{r.concerns.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
              </div>
              {r.followups.length > 0 && <p className="mt-3 text-sm"><span className="font-medium">Suggested follow-ups:</span> {r.followups.join("; ")}</p>}
            </div>
          </section>
        )}

        {r && (
          <section className="card">
            <h2 className="mb-3 font-semibold">Competencies</h2>
            <div className="space-y-2">
              {r.competencyScores.map((c) => {
                const w = job?.competencies.find((x) => x.name === c.name)?.weight;
                return (
                  <div key={c.name}>
                    <div className="flex justify-between text-sm"><span>{c.name}{w != null && <span className="text-neutral-400"> · {w}%</span>}</span><span className="font-medium">{c.score}/5</span></div>
                    <div className="mt-1 h-2 rounded bg-neutral-100"><div className="h-2 rounded bg-accent" style={{ width: `${(c.score / 5) * 100}%` }} /></div>
                    <div className="mt-1 text-xs text-neutral-500">{c.note}</div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {iv.answerScores.length > 0 && (
          <section className="card">
            <h2 className="mb-3 font-semibold">Per-answer scores &amp; evidence</h2>
            <div className="divide-y divide-neutral-100">
              {iv.answerScores.map((a, i) => (
                <div key={i} className="py-3 text-sm">
                  <div className="flex justify-between gap-4"><span className="font-medium">{a.question}</span><span className="shrink-0 font-semibold">{a.score}/5 <span className="font-normal text-neutral-400">({Math.round(a.confidence * 100)}% conf.)</span></span></div>
                  <div className="text-xs text-neutral-500">{a.competency}</div>
                  <div className="mt-1">{a.reason}</div>
                  <blockquote className="mt-1 border-l-2 border-accent pl-3 italic text-neutral-600">“{a.evidence}”</blockquote>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="card">
          <h2 className="mb-3 font-semibold">Recording &amp; transcript</h2>
          {audioUrl ? <audio ref={audio} src={audioUrl} controls className="mb-4 w-full" /> : <p className="mb-4 text-sm text-neutral-500">No recording on this device.</p>}
          <div className="space-y-2 text-sm">
            {iv.turns.map((t, i) => (
              <button key={i} className="flex w-full gap-3 rounded-lg p-2 text-left hover:bg-neutral-50" onClick={() => { if (audio.current && t.speaker === "candidate") { audio.current.currentTime = t.at / 1000; audio.current.play(); } }}>
                <span className="w-12 shrink-0 font-mono text-xs text-neutral-400">{mmss(t.at)}</span>
                <span className={`w-20 shrink-0 text-xs font-semibold uppercase ${t.speaker === "ai" ? "text-accent" : "text-emerald-700"}`}>{t.speaker === "ai" ? "AI" : "Candidate"}</span>
                <span>{t.text}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <details className="card"><summary className="cursor-pointer font-semibold">Résumé</summary><pre className="mt-2 whitespace-pre-wrap text-xs text-neutral-700">{iv.resumeText}</pre></details>
          <details className="card"><summary className="cursor-pointer font-semibold">Job description</summary><pre className="mt-2 whitespace-pre-wrap text-xs text-neutral-700">{job?.jdText}</pre></details>
        </section>

        <section className="card">
          <h2 className="mb-2 font-semibold">Admin note</h2>
          <textarea className="input" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
          <button className="btn-primary mt-2" onClick={() => { const n = { ...iv, adminNote: note }; interviewsStore.save(n); setIv(n); }}>Save note</button>
        </section>
      </main>
    </>
  );
}

export default function Page() {
  return (
    <Suspense>
      <InterviewDetail />
    </Suspense>
  );
}
