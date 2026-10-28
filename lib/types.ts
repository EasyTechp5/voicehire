export type Competency = {
  name: string;
  weight: number; // percent, all competencies sum to 100
  five: string; // what a 5 looks like
  one: string; // what a 1 looks like
};

export type JobSettings = {
  durationMin: 10 | 20 | 30;
  questionCount: number;
  difficulty: "easy" | "medium" | "hard";
  practiceMode: boolean;
};

export type Job = {
  id: string;
  title: string;
  department: string;
  seniority: string;
  jdText: string;
  competencies: Competency[];
  rubricApproved: boolean;
  settings: JobSettings;
  createdAt: number;
};

export type PlanQuestion = {
  type: "warm-up" | "resume" | "jd";
  text: string;
  competency: string;
  probes: string[];
  strongAnswer: string;
};

export type Turn = {
  speaker: "ai" | "candidate";
  text: string;
  at: number; // ms since interview start
};

export type AnswerScore = {
  question: string;
  competency: string;
  score: number; // 1-5
  confidence: number; // 0-1
  reason: string;
  evidence: string;
};

export type Report = {
  competencyScores: { name: string; score: number; note: string }[];
  overall: number; // 0-100
  summary: string;
  strengths: string[];
  concerns: string[];
  followups: string[];
  needsReview: boolean;
  model: string;
};

export type InterviewStatus =
  | "scheduled"
  | "in_progress"
  | "scoring"
  | "completed"
  | "abandoned"
  | "failed";

export type Interview = {
  id: string;
  jobId: string;
  candidateName: string;
  candidateEmail: string;
  resumeText: string;
  status: InterviewStatus;
  plan: PlanQuestion[];
  turns: Turn[];
  answerScores: AnswerScore[];
  report?: Report;
  consentAt: number;
  startedAt?: number;
  endedAt?: number;
  durationSec?: number;
  hasAudio: boolean;
  adminNote?: string;
  error?: string;
};

export const resultLabel = (score: number) =>
  score >= 80
    ? "Strong match"
    : score >= 60
      ? "Potential match"
      : score >= 40
        ? "Weak match"
        : "Not a match";
