import Link from "next/link";
import { Header } from "@/components/Header";

export default function Home() {
  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-16">
        <p className="text-sm font-medium text-accent">AI voice interviews</p>
        <h1 className="mt-2 max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
          A spoken first-round interview, scored against your rubric.
        </h1>
        <p className="mt-4 max-w-2xl text-lg text-neutral-600">
          Upload a job description. Candidates upload a résumé and talk to an AI interviewer that
          asks tailored questions and follows up. You get the recording, transcript and an
          evidence-backed score. Candidates never see the score.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Link href="/admin" className="card transition hover:border-accent">
            <h2 className="font-semibold">I&apos;m an admin →</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Create jobs, approve rubrics, review interviews, transcripts and scores.
            </p>
          </Link>
          <Link href="/interview" className="card transition hover:border-accent">
            <h2 className="font-semibold">I&apos;m a candidate →</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Pick a role, share your résumé, check your mic and start your interview.
            </p>
          </Link>
        </div>
        <ol className="mt-14 grid gap-6 text-sm text-neutral-700 sm:grid-cols-4">
          {[
            ["1. Set up", "Add a job description; AI drafts a rubric you approve."],
            ["2. Prepare", "Candidate adds a résumé and passes a mic check."],
            ["3. Talk", "Voice-to-voice interview with follow-ups and barge-in."],
            ["4. Review", "Transcript, audio, per-answer scores with quotes."],
          ].map(([t, d]) => (
            <li key={t}>
              <div className="font-semibold">{t}</div>
              <div className="mt-1 text-neutral-600">{d}</div>
            </li>
          ))}
        </ol>
      </main>
    </>
  );
}
