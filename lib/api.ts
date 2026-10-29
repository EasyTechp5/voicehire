"use client";
import type { Interview, Job, Report, Turn } from "./types";

export class ApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function call<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const r = await fetch(url, {
    ...init,
    cache: "no-store",
    headers: init?.json !== undefined ? { "content-type": "application/json" } : undefined,
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new ApiError(d.error || "Request failed", r.status);
  return d as T;
}

export const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

export type JobLite = Pick<Job, "id" | "title" | "department" | "seniority" | "settings">;

export const admin = {
  me: () => call<{ ok: true }>("/api/admin/me"),
  login: (passcode: string) => call("/api/admin/login", { method: "POST", json: { passcode } }),
  logout: () => call("/api/admin/login", { method: "DELETE" }),
  jobs: () => call<{ jobs: Job[] }>("/api/admin/jobs").then((d) => d.jobs),
  job: (id: string) => call<{ job: Job }>(`/api/admin/jobs/${id}`).then((d) => d.job),
  saveJob: (job: Job) => call("/api/admin/jobs", { method: "POST", json: job }),
  deleteJob: (id: string) => call(`/api/admin/jobs/${id}`, { method: "DELETE" }),
  interviews: (q = "") => call<{ interviews: Interview[] }>(`/api/admin/interviews?q=${encodeURIComponent(q)}`).then((d) => d.interviews),
  interview: (id: string) => call<{ interview: Interview; job: Job | null; audioUrl: string | null }>(`/api/admin/interviews/${id}`),
  saveNote: (id: string, adminNote: string) => call(`/api/admin/interviews/${id}`, { method: "PATCH", json: { adminNote } }),
  deleteInterview: (id: string) => call(`/api/admin/interviews/${id}`, { method: "DELETE" }),
  rescore: (id: string) => call(`/api/admin/interviews/${id}/rescore`, { method: "POST" }),
};

export const candidate = {
  jobs: () => call<{ jobs: JobLite[] }>("/api/public/jobs").then((d) => d.jobs),
  create: (b: { jobId: string; name: string; email: string; resumeText: string; consent: boolean }) =>
    call<{ id: string }>("/api/interviews", { method: "POST", json: b }),
  saveTurns: (id: string, turns: Turn[], started = false) =>
    call(`/api/interviews/${id}/turns`, { method: "POST", json: { turns, started } }),
  audioTarget: (id: string) => call<{ path: string; token: string }>(`/api/interviews/${id}/audio`, { method: "POST" }),
  finish: (id: string, b: { turns: Turn[]; durationSec: number; abandoned: boolean; hasAudio: boolean }) =>
    call<{ status: string; feedback?: Pick<Report, "strengths" | "concerns"> | null }>(`/api/interviews/${id}/finish`, { method: "POST", json: b }),
};
