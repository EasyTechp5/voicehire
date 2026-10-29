"use client";
import { Suspense, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Header } from "@/components/Header";
import { AdminGate } from "@/components/AdminGate";
import { IconCheck, IconCopy } from "@/components/icons";
import { admin } from "@/lib/api";
import { resultLabel, type Interview, type Job } from "@/lib/types";

const mmss = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
const tone = (n: number) => (n >= 80 ? "#10b981" : n >= 60 ? "#6366f1" : n >= 40 ? "#f59e0b" : "#ef4444");
const barTone = (n: number) => (n >= 4 ? "bg-emerald-500" : n >= 3 ? "bg-indigo-500" : n >= 2 ? "bg-amber-500" : "bg-red-500");
const initials = (n: string) => n.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
const statusStyle: Record<string, string> = {
  completed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  scoring: "bg-amber-50 text-amber-700 ring-amber-200",
  in_progress: "bg-blue-50 text-blue-700 ring-blue-200",
  abandoned: "bg-slate-100 text-slate-600 ring-slate-200",
  failed: "bg-red-50 text-red-700 ring-red-200",
  scheduled: "bg-slate-50 text-slate-600 ring-slate-200",
};

function InterviewDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [iv, setIv] = useState<Interview | null | undefined>(undefined);
  const [job, setJob] = useState<Job | null>(null);
  const [audioUrl, setAudioUrl] = useState("");
  const [note, setNote] = useState("");
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [playing, setPlaying] = useState(-1);
  const audio = useRef<HTMLAudioElement>(null);

  const load = async () => {
    try {
      const d = await admin.interview(id);
      setIv(d.interview);
      setJob(d.job);
      setNote(d.interview.adminNote ?? "");
      setAudioUrl(d.audioUrl ?? "");
    } catch { setIv(null); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  if (iv === undefined)
    return (<><Header area="admin" /><main className="mx-auto w-full max-w-6xl space-y-4 px-5 py-8"><div className="skeleton h-20" /><div className="grid gap-4 lg:grid-cols-3"><div className="skeleton h-72 lg:col-span-2" /><div className="skeleton h-72" /></div></main></>);
  if (iv === null)
    return (<><Header area="admin" /><main className="mx-auto max-w-6xl p-8"><p>Interview not found.</p><Link href="/admin" className="text-indigo-600 hover:underline">Back to dashboard</Link></main></>);

  const r = iv.report;
  const answered = iv.turns.filter((t) => t.speaker === "candidate").length;

  async function rescore() {
    setIv({ ...iv!, status: "scoring", error: undefined });
    try { await admin.rescore(id); } catch { /* the error is stored on the interview */ }
    await load();
  }
  const copyTranscript = async () => {
    const text = iv!.turns.map((t) => `${t.speaker === "ai" ? "Interviewer" : "Candidate"} [${mmss(t.at)}]: ${t.text}`).join("\n");
    await navigator.clipboard.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };
  const seek = (i: number, ms: number) => {
    if (audio.current) { audio.current.currentTime = ms / 1000; audio.current.play(); setPlaying(i); }
  };

  return (
    <>
      <Header area="admin" />
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-6 px-5 py-8">
        <Link href="/admin" className="text-sm text-slate-500 hover:text-slate-800">← Dashboard</Link>

        {/* Header */}
        <div className="card flex flex-wrap items-center gap-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-100 to-fuchsia-100 text-lg font-semibold text-indigo-700">{initials(iv.candidateName)}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold tracking-tight">{iv.candidateName}</h1>
              <span className={`badge ring-1 ring-inset ${statusStyle[iv.status]}`}>{iv.status.replace("_", " ")}</span>
              {r?.needsReview && <span className="badge bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-200">needs human review</span>}
            </div>
            <p className="mt-0.5 text-sm text-slate-500">{iv.candidateEmail} · {job?.title ?? "Deleted job"}</p>
            <p className="mt-1 text-xs text-slate-400">{new Date(iv.consentAt).toLocaleString()} · {iv.durationSec != null ? `${Math.floor(iv.durationSec / 60)}m ${iv.durationSec % 60}s` : "no duration"} · {answered} answers</p>
          </div>
          <div className="flex gap-2">
            <button className="btn-ghost" onClick={rescore} disabled={iv.turns.length < 2 || iv.status === "scoring"}>{iv.status === "scoring" ? "Scoring…" : "Re-score"}</button>
            <button className="btn-ghost hover:border-red-300 hover:text-red-600" onClick={async () => { if (confirm("Delete this interview and its recording?")) { await admin.deleteInterview(iv.id); router.push("/admin"); } }}>Delete</button>
          </div>
        </div>
        {iv.error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">Scoring error: {iv.error}</p>}
        {iv.status === "scoring" && <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">Scoring in progress. Refresh in a few seconds.</p>}

        <div className="grid items-start gap-6 lg:grid-cols-[1fr_340px]">
          <div className="space-y-6">
            {r && (
              <section className="card space-y-4">
                <h2 className="section-title">Summary</h2>
                <p className="leading-relaxed text-slate-700">{r.summary}</p>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="rounded-xl bg-emerald-50/70 p-4"><h3 className="text-sm font-semibold text-emerald-800">Strengths</h3><ul className="mt-2 space-y-1.5 text-sm text-emerald-950/80">{r.strengths.map((s, i) => <li key={i} className="flex gap-2"><span className="text-emerald-600">+</span>{s}</li>)}</ul></div>
                  <div className="rounded-xl bg-red-50/70 p-4"><h3 className="text-sm font-semibold text-red-800">Concerns</h3><ul className="mt-2 space-y-1.5 text-sm text-red-950/80">{r.concerns.map((s, i) => <li key={i} className="flex gap-2"><span className="text-red-500">−</span>{s}</li>)}</ul></div>
                </div>
                {r.followups.length > 0 && <div className="text-sm"><span className="font-medium">Suggested follow-ups:</span> <span className="text-slate-600">{r.followups.join(" · ")}</span></div>}
              </section>
            )}

            {r && (
              <section className="card">
                <h2 className="section-title mb-4">Competencies</h2>
                <div className="space-y-4">
                  {r.competencyScores.map((c) => {
                    const w = job?.competencies.find((x) => x.name === c.name)?.weight;
                    return (
                      <div key={c.name}>
                        <div className="flex items-baseline justify-between text-sm"><span className="font-medium">{c.name}{w != null && <span className="ml-1.5 text-xs font-normal text-slate-400">{w}% weight</span>}</span><span className="font-semibold tabular-nums">{c.score}<span className="font-normal text-slate-400">/5</span></span></div>
                        <div className="mt-1.5 h-2 rounded-full bg-slate-100"><div className={`h-2 rounded-full ${barTone(c.score)}`} style={{ width: `${(c.score / 5) * 100}%` }} /></div>
                        <div className="mt-1 text-xs text-slate-500">{c.note}</div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {iv.answerScores.length > 0 && (
              <section className="card">
                <h2 className="section-title mb-4">Answers &amp; evidence</h2>
                <div className="space-y-4">
                  {iv.answerScores.map((a, i) => (
                    <div key={i} className="rounded-xl border border-slate-200 p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div><div className="text-xs font-medium uppercase tracking-wide text-indigo-600">{a.competency}</div><div className="mt-0.5 font-medium">{a.question}</div></div>
                        <div className="shrink-0 text-right"><div className="text-lg font-semibold tabular-nums">{a.score}<span className="text-sm font-normal text-slate-400">/5</span></div><div className="text-[11px] text-slate-400">{Math.round(a.confidence * 100)}% confident</div></div>
                      </div>
                      <p className="mt-2 text-sm text-slate-700">{a.reason}</p>
                      <blockquote className="mt-2 rounded-r-lg border-l-4 border-indigo-300 bg-indigo-50/50 px-3 py-2 text-sm italic text-slate-600">“{a.evidence}”</blockquote>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="card">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="section-title">Transcript</h2>
                <button className="btn-ghost px-3 py-1.5 text-xs" onClick={copyTranscript}>{copied ? <><IconCheck className="mr-1.5 h-3.5 w-3.5 text-emerald-600" /> Copied</> : <><IconCopy className="mr-1.5 h-3.5 w-3.5" /> Copy</>}</button>
              </div>
              {iv.turns.length === 0 && <p className="text-sm text-slate-500">No transcript was captured.</p>}
              <div className="space-y-3">
                {iv.turns.map((t, i) => (
                  <div key={i} className={`flex gap-3 ${t.speaker === "ai" ? "" : "flex-row-reverse"}`}>
                    <span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-semibold ${t.speaker === "ai" ? "bg-indigo-100 text-indigo-700" : "bg-emerald-100 text-emerald-700"}`}>{t.speaker === "ai" ? "AI" : "C"}</span>
                    <button disabled={!audioUrl} onClick={() => seek(i, t.at)} className={`group max-w-[85%] rounded-2xl px-4 py-2.5 text-left text-sm leading-relaxed transition ${t.speaker === "ai" ? "rounded-tl-sm bg-slate-100" : "rounded-tr-sm bg-indigo-50"} ${playing === i ? "ring-2 ring-indigo-400" : ""} ${audioUrl ? "hover:brightness-95" : "cursor-default"}`}>
                      {t.text}
                      <span className="mt-1 block text-[11px] tabular-nums text-slate-400">{mmss(t.at)}{audioUrl && " · click to play from here"}</span>
                    </button>
                  </div>
                ))}
              </div>
            </section>
          </div>

          {/* Sidebar */}
          <aside className="space-y-6 lg:sticky lg:top-20">
            {r && (
              <section className="card text-center">
                <div className="text-sm text-slate-500">Overall score</div>
                <div className="relative mx-auto mt-3 h-40 w-40">
                  <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
                    <circle cx="60" cy="60" r="52" fill="none" stroke="#e2e8f0" strokeWidth="10" />
                    <circle cx="60" cy="60" r="52" fill="none" strokeWidth="10" strokeLinecap="round" stroke={tone(r.overall)} strokeDasharray={`${(r.overall / 100) * 326.7} 326.7`} />
                  </svg>
                  <div className="absolute inset-0 grid place-items-center"><div><div className="text-4xl font-semibold tabular-nums">{r.overall}</div><div className="text-xs text-slate-400">out of 100</div></div></div>
                </div>
                <div className="mt-3 inline-block rounded-full px-3 py-1 text-sm font-medium text-white" style={{ background: tone(r.overall) }}>{resultLabel(r.overall)}</div>
                <p className="mt-4 text-xs leading-relaxed text-slate-400">Model {r.model}. Assists a human decision; never the sole basis for rejection.</p>
              </section>
            )}

            <section className="card">
              <h2 className="section-title mb-3">Recording</h2>
              {audioUrl ? <audio ref={audio} src={audioUrl} controls className="w-full" onEnded={() => setPlaying(-1)} /> : <p className="text-sm text-slate-500">No recording for this interview.</p>}
            </section>

            <section className="card">
              <h2 className="section-title mb-2">Admin note</h2>
              <textarea className="input" rows={4} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add your own notes for the hiring team…" />
              <button className="btn-primary mt-3 w-full" onClick={async () => { await admin.saveNote(iv.id, note); setSaved(true); setTimeout(() => setSaved(false), 1500); }}>{saved ? "Saved ✓" : "Save note"}</button>
            </section>

            <details className="card group"><summary className="cursor-pointer font-semibold">Résumé</summary><pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-slate-600">{iv.resumeText}</pre></details>
            <details className="card group"><summary className="cursor-pointer font-semibold">Job description</summary><pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap text-xs leading-relaxed text-slate-600">{job?.jdText}</pre></details>
          </aside>
        </div>
      </main>
    </>
  );
}

export default function Page() {
  return (
    <Suspense>
      <AdminGate>
        <InterviewDetail />
      </AdminGate>
    </Suspense>
  );
}
