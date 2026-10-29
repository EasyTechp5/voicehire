"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { TextOrFile } from "./TextOrFile";
import { admin, uid } from "@/lib/api";
import type { Competency, Job } from "@/lib/types";

const blank = (): Job => ({
  id: "",
  title: "",
  department: "",
  seniority: "Mid-level",
  jdText: "",
  competencies: [],
  rubricApproved: false,
  settings: { durationMin: 10, questionCount: 6, difficulty: "medium", practiceMode: false },
  createdAt: 0,
});

function SectionHead({ n, title, hint, bare }: { n: number; title: string; hint: string; bare?: boolean }) {
  return (
    <div className={`flex items-start gap-3 ${bare ? "" : "col-span-full"}`}>
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-indigo-600 text-xs font-semibold text-white">{n}</span>
      <div>
        <h2 className="font-semibold leading-7">{title}</h2>
        <p className="text-sm text-slate-500">{hint}</p>
      </div>
    </div>
  );
}

export function JobEditor({ initial }: { initial?: Job }) {
  const router = useRouter();
  const [job, setJob] = useState<Job>(initial ?? blank());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const total = job.competencies.reduce((s, c) => s + Number(c.weight || 0), 0);
  const set = (p: Partial<Job>) => setJob((j) => ({ ...j, ...p, rubricApproved: false }));
  const setComp = (i: number, p: Partial<Competency>) =>
    set({ competencies: job.competencies.map((c, k) => (k === i ? { ...c, ...p } : c)) });

  async function draftRubric() {
    setErr("");
    setBusy(true);
    try {
      const r = await fetch("/api/rubric", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(job),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not draft rubric");
      set({ competencies: j.competencies });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function save(approve: boolean) {
    setErr("");
    if (!job.title.trim()) return setErr("Add a job title.");
    if (job.jdText.trim().length < 30) return setErr("Add the job description.");
    if (approve) {
      if (job.competencies.length < 1) return setErr("Draft or add at least one competency first.");
      if (total !== 100) return setErr(`Weights must total 100 (currently ${total}).`);
    }
    try {
      await admin.saveJob({ ...job, id: job.id || uid(), createdAt: job.createdAt || Date.now(), rubricApproved: approve });
      router.push("/admin");
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  return (
    <div className="space-y-6">
      <section className="card grid gap-4 sm:grid-cols-3">
        <SectionHead n={1} title="Role & description" hint="What the job is. The interviewer uses this to write questions." />
        <div className="sm:col-span-1">
          <label className="label">Job title</label>
          <input className="input" value={job.title} onChange={(e) => set({ title: e.target.value })} placeholder="Senior Backend Engineer" />
        </div>
        <div>
          <label className="label">Department</label>
          <input className="input" value={job.department} onChange={(e) => set({ department: e.target.value })} placeholder="Engineering" />
        </div>
        <div>
          <label className="label">Seniority</label>
          <select className="input" value={job.seniority} onChange={(e) => set({ seniority: e.target.value })}>
            {["Intern / Graduate", "Junior", "Mid-level", "Senior", "Lead / Manager"].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-3">
          <label className="label">Job description</label>
          <TextOrFile kind="jd" value={job.jdText} onChange={(v) => set({ jdText: v })} placeholder="Paste the job description, or upload a PDF…" />
        </div>
      </section>

      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionHead n={2} title="Scoring rubric" hint="5–8 weighted competencies, scored 1–5. Edit, then approve." bare />
          <button className="btn-ghost" onClick={draftRubric} disabled={busy || job.jdText.length < 30}>
            {busy ? "Drafting…" : job.competencies.length ? "Redraft with AI" : "Draft with AI"}
          </button>
        </div>
        <div className="mt-4 space-y-3">
          {job.competencies.map((c, i) => (
            <div key={i} className="grid gap-2 rounded-lg border border-neutral-200 p-3 sm:grid-cols-[1fr_90px_auto]">
              <input className="input" value={c.name} onChange={(e) => setComp(i, { name: e.target.value })} />
              <input className="input" type="number" min={0} max={100} value={c.weight} onChange={(e) => setComp(i, { weight: Number(e.target.value) })} />
              <button className="btn-ghost" onClick={() => set({ competencies: job.competencies.filter((_, k) => k !== i) })}>Remove</button>
              <input className="input sm:col-span-3" value={c.five} onChange={(e) => setComp(i, { five: e.target.value })} placeholder="What a 5 looks like" />
              <input className="input sm:col-span-3" value={c.one} onChange={(e) => setComp(i, { one: e.target.value })} placeholder="What a 1 looks like" />
            </div>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between text-sm">
          <button className="btn-ghost" onClick={() => set({ competencies: [...job.competencies, { name: "", weight: 0, five: "", one: "" }] })}>
            + Add competency
          </button>
          <span className={total === 100 ? "text-green-700" : "text-red-600"}>Total weight: {total}/100</span>
        </div>
      </section>

      <section className="card grid gap-4 sm:grid-cols-4">
        <SectionHead n={3} title="Interview settings" hint="How long and how deep the interview goes." />
        <div>
          <label className="label">Length</label>
          <select className="input" value={job.settings.durationMin} onChange={(e) => setJob({ ...job, settings: { ...job.settings, durationMin: Number(e.target.value) as 10 | 20 | 30 } })}>
            {[10, 20, 30].map((m) => <option key={m} value={m}>{m} minutes</option>)}
          </select>
        </div>
        <div>
          <label className="label">Questions</label>
          <input className="input" type="number" min={3} max={12} value={job.settings.questionCount} onChange={(e) => setJob({ ...job, settings: { ...job.settings, questionCount: Number(e.target.value) } })} />
        </div>
        <div>
          <label className="label">Difficulty</label>
          <select className="input" value={job.settings.difficulty} onChange={(e) => setJob({ ...job, settings: { ...job.settings, difficulty: e.target.value as Job["settings"]["difficulty"] } })}>
            {["easy", "medium", "hard"].map((d) => <option key={d}>{d}</option>)}
          </select>
        </div>
        <label className="flex items-end gap-2 pb-2 text-sm">
          <input type="checkbox" checked={job.settings.practiceMode} onChange={(e) => setJob({ ...job, settings: { ...job.settings, practiceMode: e.target.checked } })} />
          Practice mode (show feedback)
        </label>
      </section>

      <div className="sticky bottom-0 -mx-5 border-t border-slate-200 bg-white/90 px-5 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center gap-3">
          <button className="btn-primary" onClick={() => save(true)}>Approve rubric &amp; publish</button>
          <button className="btn-ghost" onClick={() => save(false)}>Save draft</button>
          {err && <p className="text-sm text-red-600">{err}</p>}
        </div>
      </div>
    </div>
  );
}
