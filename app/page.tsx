import Link from "next/link";
import { Header } from "@/components/Header";
import { Logo } from "@/components/Logo";
import { IconArrow, IconChart, IconDoc, IconLock, IconMic, IconShield, IconSpark, IconClock } from "@/components/icons";

const features = [
  { icon: IconSpark, title: "Questions built for each candidate", body: "Drawn from your job description and the candidate's résumé: a warm-up, experience questions, then role-specific ones." },
  { icon: IconMic, title: "A real spoken conversation", body: "Natural voice, follow-ups when answers are vague, and candidates can interrupt just like they would with a person." },
  { icon: IconChart, title: "Scores with evidence", body: "Every competency score links to an exact quote from the transcript, so you can see why, not just what." },
  { icon: IconDoc, title: "Rubric you control", body: "AI drafts 5–8 weighted competencies from the job description. You edit and approve before any interview runs." },
  { icon: IconLock, title: "Private by design", body: "Recordings sit in private storage behind short-lived links. Candidates never see scores or the rubric." },
  { icon: IconShield, title: "Humans decide", body: "Scores support your decision and are never the sole basis for rejection. Low-confidence results are flagged for review." },
];

const steps = [
  ["Add the job", "Paste or upload a job description and approve the AI-drafted rubric."],
  ["Share the link", "Candidates add a résumé, give consent and check their mic."],
  ["They talk", "A 10 to 30 minute spoken interview that adapts to their answers."],
  ["You review", "Recording, transcript, scores and a written summary in minutes."],
];

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-[#f6f7fb]">
      <Header />

      {/* Hero */}
      <section className="hero-bg relative overflow-hidden">
        <div className="dot-grid pointer-events-none absolute inset-0 opacity-60" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 pb-24 pt-16 sm:pt-24 lg:grid-cols-[1.25fr_1fr]">
          <div>
            <span className="chip border-indigo-200 bg-white/80 font-medium text-indigo-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> AI voice interviews
            </span>
            <h1 className="mt-5 text-4xl font-semibold leading-[1.06] tracking-tight sm:text-6xl">
              Screen candidates with a conversation, <span className="gradient-text">not a form.</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600">
              An AI interviewer built from your job description and each candidate&apos;s résumé asks the same
              rubric-based questions, listens, follows up, and gives you an evidence-backed score in minutes.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/admin" className="btn-primary px-6 py-3 text-base">Create an interview <IconArrow className="ml-2 h-4 w-4" /></Link>
              <Link href="/interview" className="btn-ghost px-6 py-3 text-base">I&apos;m a candidate</Link>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-600">
              {["Consistent for every candidate", "Recording and full transcript", "Scores never shown to candidates"].map((t) => (
                <li key={t} className="flex items-center gap-2"><span className="grid h-4 w-4 place-items-center rounded-full bg-emerald-100 text-emerald-700 text-[10px]">✓</span>{t}</li>
              ))}
            </ul>
          </div>

          <div className="room relative mx-auto w-full max-w-sm rounded-3xl p-6 text-white" aria-hidden>
            <div className="mb-4 flex items-center justify-between text-xs text-slate-400">
              <span className="flex items-center gap-2"><span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> Recording · 03:12</span>
              <span>Customer Support</span>
            </div>
            <div className="orb mx-auto h-28 w-28" data-state="speaking" />
            <p className="mt-4 text-center text-sm text-slate-300">Interviewer is speaking</p>
            <div className="mt-5 space-y-2 text-sm">
              <div className="max-w-[88%] rounded-2xl rounded-bl-sm bg-white/10 px-4 py-2.5">Tell me about a time you turned around an upset customer.</div>
              <div className="ml-auto max-w-[88%] rounded-2xl rounded-br-sm bg-indigo-500 px-4 py-2.5">A client was double charged. I refunded it on the call and followed up the same day…</div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto w-full max-w-6xl px-5 py-20">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-indigo-600">Why teams use it</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Fair, consistent first-round interviews, at any hour.</h2>
        </div>
        <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {features.map(({ icon: Icon, title, body }) => (
            <div key={title} className="card card-hover">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><Icon /></div>
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="border-y border-slate-200 bg-white">
        <div className="mx-auto w-full max-w-6xl px-5 py-20">
          <p className="text-sm font-semibold text-indigo-600">How it works</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">From job description to scored interview.</h2>
          <ol className="mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map(([t, d], i) => (
              <li key={t} className="relative">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-indigo-600 to-violet-600 text-sm font-semibold text-white shadow-sm">{i + 1}</span>
                <div className="mt-4 font-semibold">{t}</div>
                <div className="mt-1 text-sm leading-relaxed text-slate-600">{d}</div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto w-full max-w-6xl px-5 py-20">
        <div className="room relative overflow-hidden rounded-3xl px-8 py-14 text-center text-white sm:px-16">
          <IconClock className="mx-auto h-8 w-8 text-indigo-300" />
          <h2 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">Run your first interview in minutes.</h2>
          <p className="mx-auto mt-3 max-w-xl text-slate-300">Add a job, approve the rubric and send the link. No scheduling, no calendar back-and-forth.</p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link href="/admin" className="rounded-xl bg-white px-6 py-3 font-semibold text-slate-900 transition hover:bg-slate-100">Create an interview</Link>
            <Link href="/interview" className="rounded-xl border border-white/25 px-6 py-3 font-semibold text-white transition hover:bg-white/10">Try as a candidate</Link>
          </div>
        </div>
      </section>

      <footer className="mt-auto border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-sm text-slate-500">
          <span className="flex items-center gap-2 font-medium text-slate-700"><Logo size={22} /> VoiceHire</span>
          <span>AI scores assist a human decision and are never the sole basis for rejection. Candidates are told they are speaking with an AI and consent to recording.</span>
        </div>
      </footer>
    </div>
  );
}
