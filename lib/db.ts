import type { Interview, Job, Turn } from "./types";

/* eslint-disable @typescript-eslint/no-explicit-any */
export const jobFromRow = (r: any): Job => ({
  id: r.id,
  title: r.title,
  department: r.department,
  seniority: r.seniority,
  jdText: r.jd_text,
  competencies: r.competencies ?? [],
  rubricApproved: r.rubric_approved,
  settings: r.settings,
  createdAt: Date.parse(r.created_at),
});

export const jobToRow = (j: Job) => ({
  id: j.id,
  title: j.title,
  department: j.department,
  seniority: j.seniority,
  jd_text: j.jdText,
  competencies: j.competencies,
  rubric_approved: j.rubricApproved,
  settings: j.settings,
  updated_at: new Date().toISOString(),
});

export const interviewFromRow = (r: any, turns: Turn[] = []): Interview => ({
  id: r.id,
  jobId: r.job_id ?? "",
  candidateName: r.candidate_name,
  candidateEmail: r.candidate_email,
  resumeText: r.resume_text,
  status: r.status,
  plan: r.plan ?? [],
  turns,
  answerScores: r.answer_scores ?? [],
  report: r.report ?? undefined,
  consentAt: Date.parse(r.consent_at),
  startedAt: r.started_at ? Date.parse(r.started_at) : undefined,
  endedAt: r.ended_at ? Date.parse(r.ended_at) : undefined,
  durationSec: r.duration_seconds ?? undefined,
  hasAudio: !!r.recording_path,
  adminNote: r.admin_note ?? undefined,
  error: r.error ?? undefined,
});

export const turnFromRow = (t: any): Turn => ({ speaker: t.speaker, text: t.text, at: t.at_ms });
