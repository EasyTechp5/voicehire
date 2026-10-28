import Link from "next/link";
import { Header } from "@/components/Header";

const steps = [
  ["Set up", "Add a job description. AI drafts a weighted rubric you approve."],
  ["Prepare", "Candidates add a résumé, give consent and pass a quick mic check."],
  ["Talk", "A natural voice-to-voice interview with tailored questions and follow-ups."],
  ["Review", "Recording, transcript and per-answer scores, each backed by a quote."],
];

export default function Home() {
  return (
    <div className="hero-bg flex min-h-screen flex-col">
      <Header />
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 pb-20 pt-16 sm:pt-24">
        <div className="grid items-center gap-12 lg:grid-cols-[1.25fr_1fr]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white/70 px-3 py-1 text-xs font-medium text-indigo-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> AI voice interviews
            </span>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.08] tracking-tight sm:text-6xl">
              Screen candidates with a conversation, <span className="gradient-text">not a form.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg text-slate-600">
              An AI interviewer built from your job description and each candidate&apos;s résumé asks the same
              rubric-based questions, listens, follows up, and hands you an evidence-backed score in minutes.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/admin" className="btn-primary px-6 py-3 text-base">Create an interview</Link>
              <Link href="/interview" className="btn-ghost px-6 py-3 text-base">I&apos;m a candidate</Link>
            </div>
            <p className="mt-4 text-xs text-slate-500">Scores assist a human decision and are never shown to candidates.</p>
          </div>

          <div className="room relative mx-auto w-full max-w-sm rounded-3xl p-6 text-white" aria-hidden>
            <div className="orb mx-auto h-28 w-28" data-state="speaking" />
            <p className="mt-4 text-center text-sm text-slate-300">Interviewer is speaking</p>
            <div className="mt-5 space-y-2 text-sm">
              <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-white/10 px-4 py-2.5">Tell me about a project where you owned the outcome end to end.</div>
              <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-indigo-500 px-4 py-2.5">I led our billing migration, cutting failed payments by 38%…</div>
            </div>
          </div>
        </div>

        <ol className="mt-24 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map(([t, d], i) => (
            <li key={t} className="card">
              <span className="grid h-8 w-8 place-items-center rounded-full bg-indigo-50 text-sm font-semibold text-indigo-700">{i + 1}</span>
              <div className="mt-3 font-semibold">{t}</div>
              <div className="mt-1 text-sm text-slate-600">{d}</div>
            </li>
          ))}
        </ol>
      </main>
    </div>
  );
}
