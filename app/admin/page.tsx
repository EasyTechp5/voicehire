"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Header } from "@/components/Header";
import { AdminGate } from "@/components/AdminGate";
import { IconBriefcase, IconChart, IconCheck, IconClock, IconCopy, IconInbox, IconUsers } from "@/components/icons";
import { admin } from "@/lib/api";
import { resultLabel, type Interview, type Job } from "@/lib/types";

const fmtDur = (s?: number | null) => (s == null ? "—" : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`);
const statusStyle: Record<string, string> = {
  completed: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  scoring: "bg-amber-50 text-amber-700 ring-amber-200",
  in_progress: "bg-blue-50 text-blue-700 ring-blue-200",
  abandoned: "bg-slate-100 text-slate-600 ring-slate-200",
  failed: "bg-red-50 text-red-700 ring-red-200",
  scheduled: "bg-slate-50 text-slate-600 ring-slate-200",
};
const scoreColor = (n: number) => (n >= 80 ? "bg-emerald-500" : n >= 60 ? "bg-indigo-500" : n >= 40 ? "bg-amber-500" : "bg-red-500");
const initials = (n: string) => n.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();

export default function Admin() {
  return <AdminGate><Dashboard /></AdminGate>;
}

function Dashboard() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [interviews, setInterviews] = useState<Interview[] | null>(null);
  const [q, setQ] = useState("");
  const [jobFilter, setJobFilter] = useState("");
  const [err, setErr] = useState("");
  const [copied, setCopied] = useState("");

  const load = useCallback(async (query: string) => {
    try {
      const [j, i] = await Promise.all([admin.jobs(), admin.interviews(query)]);
      setJobs(j);
      setInterviews(i);
      setErr("");
    } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { const t = setTimeout(() => load(q), q ? 350 : 0); return () => clearTimeout(t); }, [q, load]);

  const rows = (interviews ?? []).filter((i) => !jobFilter || i.jobId === jobFilter);
  const done = (interviews ?? []).filter((i) => i.report);
  const avgScore = done.length ? Math.round(done.reduce((s, i) => s + i.report!.overall, 0) / done.length) : null;
  const avgDur = done.length ? Math.round(done.reduce((s, i) => s + (i.durationSec ?? 0), 0) / done.length) : null;
  const jobTitle = (id: string) => jobs?.find((j) => j.id === id)?.title ?? "Deleted job";

  const copy = async (id: string) => {
    await navigator.clipboard.writeText(`${location.origin}/interview?job=${id}`).catch(() => {});
    setCopied(id);
    setTimeout(() => setCopied(""), 1600);
  };

  const stats = [
    { label: "Open jobs", value: jobs ? jobs.filter((j) => j.rubricApproved).length : null, icon: IconBriefcase, tint: "bg-indigo-50 text-indigo-600" },
    { label: "Interviews", value: interviews?.length ?? null, icon: IconUsers, tint: "bg-violet-50 text-violet-600" },
    { label: "Average score", value: avgScore, icon: IconChart, tint: "bg-emerald-50 text-emerald-600" },
    { label: "Average length", value: avgDur != null ? fmtDur(avgDur) : null, icon: IconClock, tint: "bg-amber-50 text-amber-600" },
  ];

  return (
    <>
      <Header area="admin" />
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-10 px-5 py-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
            <p className="text-sm text-slate-500">Jobs, interviews and scores. Data is stored securely in Supabase.</p>
          </div>
          <Link href="/admin/jobs/new" className="btn-primary sm:hidden">+ New job</Link>
        </div>

        <p className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-2.5 text-sm text-amber-900">
          AI scores support a human decision; they must never be the sole basis for rejecting a candidate.
        </p>
        {err && <p className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-700">{err}</p>}

        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {stats.map(({ label, value, icon: Icon, tint }) => (
            <div key={label} className="card flex items-center gap-4">
              <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${tint}`}><Icon /></div>
              <div className="min-w-0">
                <div className="text-xs font-medium text-slate-500">{label}</div>
                {value === null ? <div className="skeleton mt-1 h-7 w-14" /> : <div className="text-2xl font-semibold tracking-tight">{value === 0 && label === "Average score" ? "—" : value ?? "—"}</div>}
              </div>
            </div>
          ))}
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="section-title">Jobs</h2>
            <Link href="/admin/jobs/new" className="btn-ghost hidden sm:inline-flex">+ New job</Link>
          </div>
          {jobs === null && <div className="grid gap-4 sm:grid-cols-2"><div className="skeleton h-28" /><div className="skeleton h-28" /></div>}
          {jobs && jobs.length === 0 && (
            <div className="card flex flex-col items-center py-12 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-indigo-50 text-indigo-600"><IconBriefcase /></div>
              <h3 className="mt-4 font-semibold">Create your first job</h3>
              <p className="mt-1 max-w-sm text-sm text-slate-500">Add a job description, approve the AI-drafted rubric, then share the interview link.</p>
              <Link href="/admin/jobs/new" className="btn-primary mt-5">Create a job</Link>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {jobs?.map((j) => (
              <div key={j.id} className="card card-hover flex flex-col justify-between gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{j.title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                      <span>{j.department || "General"}</span><span>·</span><span>{j.settings.durationMin} min</span><span>·</span><span>{j.settings.questionCount} questions</span>
                    </div>
                  </div>
                  <span className={`badge ring-1 ring-inset ${j.rubricApproved ? "bg-emerald-50 text-emerald-700 ring-emerald-200" : "bg-slate-100 text-slate-600 ring-slate-200"}`}>
                    {j.rubricApproved ? "Published" : "Draft"}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {j.rubricApproved && (
                    <button className="btn-ghost px-3 py-1.5 text-xs" onClick={() => copy(j.id)}>
                      {copied === j.id ? <><IconCheck className="mr-1.5 h-3.5 w-3.5 text-emerald-600" /> Link copied</> : <><IconCopy className="mr-1.5 h-3.5 w-3.5" /> Copy interview link</>}
                    </button>
                  )}
                  <Link href={`/admin/jobs/${j.id}`} className="btn-ghost px-3 py-1.5 text-xs">Edit</Link>
                  <button className="ml-auto rounded-lg px-2 py-1.5 text-xs text-slate-400 transition hover:bg-red-50 hover:text-red-600" onClick={async () => { if (confirm("Delete this job?")) { await admin.deleteJob(j.id); load(q); } }}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="section-title">Interviews</h2>
            <div className="flex flex-wrap gap-3">
              <input className="input w-64" placeholder="Search name, email, or what was said…" value={q} onChange={(e) => setQ(e.target.value)} />
              <select className="input w-48" value={jobFilter} onChange={(e) => setJobFilter(e.target.value)}>
                <option value="">All jobs</option>
                {jobs?.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
              </select>
            </div>
          </div>
          <div className="card overflow-x-auto p-0">
            <table className="w-full text-left text-sm">
              <thead className="table-head">
                <tr>{["Candidate", "Job", "Date", "Status", "Length", "Score"].map((h) => <th key={h} className="px-5 py-3 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody>
                {interviews === null && [0, 1, 2].map((k) => <tr key={k}><td colSpan={6} className="px-5 py-3"><div className="skeleton h-9" /></td></tr>)}
                {interviews && rows.length === 0 && (
                  <tr><td colSpan={6} className="px-5 py-14 text-center">
                    <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-500"><IconInbox /></div>
                    <div className="mt-3 font-medium">{q ? "No matching interviews" : "No interviews yet"}</div>
                    <div className="text-sm text-slate-500">{q ? "Try a different search." : "Share a job's interview link to get started."}</div>
                  </td></tr>
                )}
                {rows.map((i) => (
                  <tr key={i.id} className="border-b border-slate-100 transition last:border-0 hover:bg-slate-50/80">
                    <td className="px-5 py-3.5">
                      <Link className="flex items-center gap-3" href={`/admin/interviews/${i.id}`}>
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-indigo-100 to-fuchsia-100 text-xs font-semibold text-indigo-700">{initials(i.candidateName)}</span>
                        <span><span className="block font-medium text-slate-900 hover:text-indigo-600">{i.candidateName}</span><span className="block text-xs text-slate-500">{i.candidateEmail}</span></span>
                      </Link>
                    </td>
                    <td className="px-5 py-3.5 text-slate-700">{jobTitle(i.jobId)}</td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-slate-600">{new Date(i.consentAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}<span className="block text-xs text-slate-400">{new Date(i.consentAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span></td>
                    <td className="px-5 py-3.5">
                      <span className={`badge ring-1 ring-inset ${statusStyle[i.status]}`}>{i.status.replace("_", " ")}</span>
                      {i.report?.needsReview && <span className="badge ml-1.5 bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-200">needs review</span>}
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-slate-600">{fmtDur(i.durationSec)}</td>
                    <td className="px-5 py-3.5">
                      {i.report ? (
                        <div className="flex items-center gap-3">
                          <span className="w-7 font-semibold tabular-nums">{i.report.overall}</span>
                          <div className="hidden w-20 sm:block"><div className="h-1.5 rounded-full bg-slate-100"><div className={`h-1.5 rounded-full ${scoreColor(i.report.overall)}`} style={{ width: `${i.report.overall}%` }} /></div><div className="mt-1 text-[11px] text-slate-500">{resultLabel(i.report.overall)}</div></div>
                        </div>
                      ) : <span className="text-slate-400">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </>
  );
}
