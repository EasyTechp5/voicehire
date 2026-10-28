"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { TextOrFile } from "./TextOrFile";
import { LiveInterview } from "./LiveInterview";
import { audioStore, interviewsStore, jobsStore, uid, useStore } from "@/lib/store";
import { sttSupported } from "@/lib/speech";
import type { Interview, Job, PlanQuestion, Report } from "@/lib/types";

type Step = "pick" | "details" | "check" | "preparing" | "live" | "wrapping" | "done";

export function InterviewFlow() {
  const params = useSearchParams();
  const jobs = useStore(jobsStore.all);
  const published = jobs?.filter((j) => j.rubricApproved);
  const [job, setJob] = useState<Job | null>(null);
  const [step, setStep] = useState<Step>("pick");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [resume, setResume] = useState("");
  const [consent, setConsent] = useState(false);
  const [err, setErr] = useState("");
  const [plan, setPlan] = useState<PlanQuestion[]>([]);
  const [feedback, setFeedback] = useState<Report | null>(null);
  const ivRef = useRef<Interview | null>(null);

  useEffect(() => {
    const id = params.get("job");
    if (id && published && !job) {
      const j = published.find((x) => x.id === id);
      if (j) { setJob(j); setStep("details"); }
    }
  }, [params, published, job]);

  async function prepare() {
    if (!job) return;
    setErr("");
    setStep("preparing");
    try {
      const r = await fetch("/api/plan", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ job, resumeText: resume }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Could not prepare the interview.");
      setPlan(j.questions);
      ivRef.current = {
        id: uid(), jobId: job.id, candidateName: name.trim(), candidateEmail: email.trim(),
        resumeText: resume, status: "scheduled", plan: j.questions, turns: [], answerScores: [],
        consentAt: Date.now(), hasAudio: false,
      };
      interviewsStore.save(ivRef.current);
      setStep("live");
    } catch (e) {
      setErr((e as Error).message);
      setStep("check");
    }
  }

  const onFinished = useCallback(
    async (res: { turns: Interview["turns"]; durationSec: number; audio: Blob | null; abandoned: boolean }) => {
      const base = ivRef.current!;
      if (res.audio) await audioStore.save(base.id, res.audio);
      const common: Interview = {
        ...base, turns: res.turns, durationSec: res.durationSec, endedAt: Date.now(), hasAudio: !!res.audio,
      };
      const answered = res.turns.filter((t) => t.speaker === "candidate").length;
      if (res.abandoned && answered < 2) {
        interviewsStore.save({ ...common, status: "abandoned" });
        return setStep("done");
      }
      interviewsStore.save({ ...common, status: "scoring" });
      setStep("wrapping");
      try {
        const r = await fetch("/api/score", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ job, plan: base.plan, turns: res.turns }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Scoring failed");
        interviewsStore.save({ ...common, status: "completed", answerScores: j.answers, report: j.report });
        if (job?.settings.practiceMode) setFeedback(j.report);
      } catch (e) {
        interviewsStore.save({ ...common, status: "failed", error: (e as Error).message });
      }
      setStep("done");
    },
    [job],
  );

  if (jobs === null) return null;

  if (step === "pick")
    return (
      <div>
        <h1 className="text-2xl font-semibold">Choose your interview</h1>
        <div className="mt-4 space-y-3">
          {published?.length === 0 && <p className="card text-sm text-neutral-600">No interviews are open yet. An admin needs to publish a job first.</p>}
          {published?.map((j) => (
            <button key={j.id} className="card block w-full text-left transition hover:border-accent" onClick={() => { setJob(j); setStep("details"); }}>
              <div className="font-medium">{j.title}</div>
              <div className="text-sm text-neutral-500">{j.department} · about {j.settings.durationMin} minutes</div>
            </button>
          ))}
        </div>
      </div>
    );

  if (!job) return null;

  if (step === "details")
    return (
      <div className="space-y-5">
        <div>
          <h1 className="text-2xl font-semibold">{job.title}</h1>
          <p className="text-sm text-neutral-500">A spoken interview of about {job.settings.durationMin} minutes with an AI interviewer.</p>
        </div>
        <div className="card grid gap-4 sm:grid-cols-2">
          <div><label className="label">Full name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><label className="label">Email</label><input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="sm:col-span-2">
            <label className="label">Résumé</label>
            <TextOrFile kind="resume" rows={7} value={resume} onChange={setResume} placeholder="Paste your résumé, or upload a PDF…" />
          </div>
        </div>
        <label className="card flex gap-3 text-sm">
          <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>
            I understand I will be speaking with an <b>AI</b>, that my voice will be <b>recorded and transcribed</b>, and that
            the recruiter will review the recording, transcript and an automated assessment. A human makes the final decision.
          </span>
        </label>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button className="btn-primary" disabled={!name.trim() || !/\S+@\S+/.test(email) || resume.trim().length < 30 || !consent} onClick={() => setStep("check")}>
          Continue to mic check
        </button>
      </div>
    );

  if (step === "check") return <MicCheck err={err} onReady={prepare} />;

  if (step === "preparing")
    return <div className="card text-center"><p className="font-medium">Preparing your personalised questions…</p><p className="mt-1 text-sm text-neutral-500">This takes about 15 seconds.</p></div>;

  if (step === "live") return <LiveInterview job={job} plan={plan} onFinished={onFinished} onStart={() => { ivRef.current = { ...ivRef.current!, status: "in_progress", startedAt: Date.now() }; interviewsStore.save(ivRef.current); }} />;

  if (step === "wrapping")
    return <div className="card text-center"><p className="font-medium">Wrapping up…</p><p className="mt-1 text-sm text-neutral-500">Please keep this tab open for a moment while we save your interview.</p></div>;

  return (
    <div className="card space-y-3 text-center">
      <h1 className="text-2xl font-semibold">Thank you{name ? `, ${name.split(" ")[0]}` : ""}!</h1>
      <p className="text-neutral-600">Your interview is complete. You will hear from us.</p>
      {feedback && (
        <div className="mx-auto max-w-lg space-y-3 pt-3 text-left text-sm">
          <h2 className="font-semibold">Practice feedback</h2>
          <div><b className="text-green-700">What went well</b><ul className="list-disc pl-5">{feedback.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
          <div><b className="text-amber-700">To improve</b><ul className="list-disc pl-5">{feedback.concerns.map((s, i) => <li key={i}>{s}</li>)}</ul></div>
        </div>
      )}
    </div>
  );
}

function MicCheck({ err, onReady }: { err: string; onReady: () => void }) {
  const [level, setLevel] = useState(0);
  const [micOk, setMicOk] = useState(false);
  const [micErr, setMicErr] = useState("");
  const [heard, setHeard] = useState(false);
  const stream = useRef<MediaStream | null>(null);

  useEffect(() => () => stream.current?.getTracks().forEach((t) => t.stop()), []);

  async function testMic() {
    setMicErr("");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      stream.current = s;
      setMicOk(true);
      const ctx = new AudioContext();
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      ctx.createMediaStreamSource(s).connect(an);
      const buf = new Uint8Array(an.fftSize);
      const tick = () => {
        an.getByteTimeDomainData(buf);
        let peak = 0;
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
        setLevel(Math.min(1, peak / 64));
        if (stream.current) requestAnimationFrame(tick);
      };
      tick();
    } catch {
      setMicErr("We couldn't access your microphone. Allow it in your browser's address bar and try again.");
    }
  }

  function playTest() {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance("Hello! If you can hear this, your speakers are working.");
    u.onend = () => setHeard(true);
    speechSynthesis.speak(u);
  }

  const supported = sttSupported();
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Quick mic and speaker check</h1>
      {!supported && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          Your browser doesn&apos;t support speech recognition. You can still do the interview by typing your answers,
          or use Chrome, Edge or Safari for voice.
        </p>
      )}
      <div className="card space-y-4">
        <div>
          <button className="btn-ghost" onClick={testMic} disabled={micOk}>{micOk ? "Microphone on ✓" : "1. Test microphone"}</button>
          {micOk && (
            <div className="mt-3">
              <div className="h-2 w-full rounded bg-neutral-100"><div className="h-2 rounded bg-green-500 transition-all" style={{ width: `${level * 100}%` }} /></div>
              <p className="mt-1 text-xs text-neutral-500">Say something: the bar should move.</p>
            </div>
          )}
          {micErr && <p className="mt-2 text-sm text-red-600">{micErr}</p>}
        </div>
        <div>
          <button className="btn-ghost" onClick={playTest}>{heard ? "Played ✓" : "2. Play test sound"}</button>
          <p className="mt-1 text-xs text-neutral-500">Use headphones in a quiet room for the best result.</p>
        </div>
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <button className="btn-primary" disabled={!micOk && supported} onClick={() => { stream.current?.getTracks().forEach((t) => t.stop()); stream.current = null; onReady(); }}>
        I&apos;m ready, prepare my interview
      </button>
    </div>
  );
}
