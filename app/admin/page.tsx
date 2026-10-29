"use client";
import Link from "next/link";
import { Header } from "@/components/Header";
import { AdminGate } from "@/components/AdminGate";
import { admin } from "@/lib/api";
import type { Interview, Job } from "@/lib/types";
import { resultLabel } from "@/lib/types";
import { useCallback, useEffect, useState } from "react";

const fmtDur = (s?: number) => (s == null ? "—" : `${Math.floor(s / 60)}m ${s % 60}s`);
const statusStyle: Record<string, string> = {
  completed: "bg-green-100 text-green-800",
  scoring: "bg-amber-100 text-amber-800",
  in_progress: "bg-blue-100 text-blue-800",
  abandoned: "bg-neutral-200 text-neutral-700",
  failed: "bg-red-100 text-red-800",
  scheduled: "bg-neutral-100 text-neutral-700",
};

export default function Admin() {
  return <AdminGate><Dashboard /></AdminGate>;
}

function Dashboard() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [interviews, setInterviews] = useState<Interview[] | null>(null);
  const [q, setQ] = useState("");
  const [jobFilter, setJobFilter] = useState("");
  const [err, setErr] = useState("");

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

  return (
    <>
      <Header area="admin" />
      <main className="mx-auto w-full max-w-6xl flex-1 space-y-8 px-5 py-8">
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          AI scores support a human decision; they must never be the sole basis for rejecting a candidate.
          Transcripts, scores and recordings are stored securely in Supabase.
        </p>

        <section className="grid gap-4 sm:grid-cols-4">
          {[
            ["Jobs", jobs?.length ?? 0],
            ["Interviews", interviews?.length ?? 0],
            ["Avg score", avgScore ?? "—"],
            ["Avg duration", fmtDur(avgDur ?? undefined)],
          ].map(([l, v]) => (
            <div key={l as string} className="card">
              <div className="text-sm text-neutral-500">{l}</div>
              <div className="mt-1 text-2xl font-semibold">{v}</div>
            </div>
          ))}
        </section>

        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Jobs</h2>
            <Link href="/admin/jobs/new" className="btn-primary">New job</Link>
          </div>
          {jobs && jobs.length === 0 && <p className="card text-sm text-neutral-600">No jobs yet. Create one to start interviewing.</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            {jobs?.map((j) => (
              <div key={j.id} className="card flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{j.title}</div>
                  <div className="text-sm text-neutral-500">
                    {j.department} · {j.settings.durationMin} min · {j.rubricApproved ? "Published" : "Draft rubric"}
                  </div>
                  {j.rubricApproved && (
                    <div className="mt-2 text-xs text-neutral-500">
                      Candidate link: <code className="rounded bg-neutral-100 px-1">/interview?job={j.id}</code>
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  <Link href={`/admin/jobs/${j.id}`} className="btn-ghost">Edit</Link>
                  <button className="btn-ghost" onClick={async () => { if (confirm("Delete this job?")) { await admin.deleteJob(j.id); load(q); } }}>✕</button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Interviews</h2>
          <div className="mb-3 flex flex-wrap gap-3">
            <input className="input max-w-xs" placeholder="Search name, email or what was said…" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="input max-w-xs" value={jobFilter} onChange={(e) => setJobFilter(e.target.value)}>
              <option value="">All jobs</option>
              {jobs?.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
            </select>
          </div>
          <div className="card overflow-x-auto p-0">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-neutral-200 text-xs uppercase text-neutral-500">
                <tr>
                  {["Candidate", "Job", "Date", "Status", "Duration", "Score", "Result"].map((h) => <th key={h} className="px-4 py-3">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && <tr><td colSpan={7} className="px-4 py-6 text-neutral-500">No interviews yet.</td></tr>}
                {rows.map((i) => (
                  <tr key={i.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                    <td className="px-4 py-3"><Link className="font-medium text-accent hover:underline" href={`/admin/interviews/${i.id}`}>{i.candidateName}</Link><div className="text-xs text-neutral-500">{i.candidateEmail}</div></td>
                    <td className="px-4 py-3">{jobTitle(i.jobId)}</td>
                    <td className="px-4 py-3">{new Date(i.consentAt).toLocaleString()}</td>
                    <td className="px-4 py-3"><span className={`rounded-full px-2 py-0.5 text-xs ${statusStyle[i.status]}`}>{i.status.replace("_", " ")}</span>{i.report?.needsReview && <span className="ml-1 rounded-full bg-orange-100 px-2 py-0.5 text-xs text-orange-800">needs review</span>}</td>
                    <td className="px-4 py-3">{fmtDur(i.durationSec)}</td>
                    <td className="px-4 py-3 font-medium">{i.report ? i.report.overall : "—"}</td>
                    <td className="px-4 py-3">{i.report ? resultLabel(i.report.overall) : "—"}</td>
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
