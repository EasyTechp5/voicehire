"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { TextOrFile } from "./TextOrFile";
import { LiveInterview } from "./LiveInterview";
import { candidate, type JobLite } from "@/lib/api";
import { sttSupported } from "@/lib/speech";
import { serverSttAvailable } from "@/lib/vad";
import { IconArrow, IconBriefcase, IconClock } from "./icons";
import type { Report, Turn } from "@/lib/types";

type Step = "pick" | "details" | "check" | "preparing" | "live" | "wrapping" | "done";

export function InterviewFlow() {
  const params = useSearchParams();
  const [jobs, setJobs] = useState<JobLite[] | null>(null);
  const [job, setJob] = useState<JobLite | null>(null);
  const [step, setStep] = useState<Step>("pick");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [resume, setResume] = useState("");
  const [consent, setConsent] = useState(false);
  const [err, setErr] = useState("");
  const [feedback, setFeedback] = useState<Pick<Report, "strengths" | "concerns"> | null>(null);
  const interviewId = useRef("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => { candidate.jobs().then(setJobs).catch(() => setJobs([])); }, []);

  useEffect(() => {
    const id = params.get("job");
    if (id && jobs && !job) {
      const j = jobs.find((x) => x.id === id);
      if (j) { setJob(j); setStep("details"); }
    }
  }, [params, jobs, job]);

  async function prepare() {
    if (!job) return;
    setErr("");
    setStep("preparing");
    try {
      const { id } = await candidate.create({ jobId: job.id, name: name.trim(), email: email.trim(), resumeText: resume, consent });
      interviewId.current = id;
      setStep("live");
    } catch (e) {
      setErr((e as Error).message);
      setStep("check");
    }
  }

  // Autosave every turn (debounced) so a dropped call loses nothing.
  const onTurns = useCallback((turns: Turn[]) => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { candidate.saveTurns(interviewId.current, turns).catch(() => {}); }, 500);
  }, []);

  const onFinished = useCallback(
    async (res: { turns: Turn[]; durationSec: number; audio: Blob | null; abandoned: boolean }) => {
      clearTimeout(saveTimer.current);
      const id = interviewId.current;
      setStep("wrapping");
      let hasAudio = false;
      if (res.audio) {
        try {
          const { path, token } = await candidate.audioTarget(id);
          const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
          const { error } = await supa.storage.from("recordings").uploadToSignedUrl(path, token, res.audio, { contentType: res.audio.type || "audio/webm" });
          hasAudio = !error;
        } catch { /* recording is best-effort; the transcript is already saved */ }
      }
      try {
        const out = await candidate.finish(id, { turns: res.turns, durationSec: res.durationSec, abandoned: res.abandoned, hasAudio });
        if (out.feedback) setFeedback(out.feedback);
      } catch { /* admin can re-score from the dashboard */ }
      setStep("done");
    },
    [],
  );

  if (jobs === null) return <div className="space-y-4"><div className="skeleton h-8 w-64" /><div className="grid gap-4 sm:grid-cols-2"><div className="skeleton h-40" /><div className="skeleton h-40" /></div></div>;

  const stepIdx = { pick: 0, details: 1, check: 2, preparing: 2, live: 3, wrapping: 3, done: 4 }[step];
  const Stepper = (
    <ol className="mb-6 flex items-center gap-2 text-xs">
      {["Role", "Your details", "Mic check", "Interview", "Done"].map((l, i) => (
        <li key={l} className="flex flex-1 items-center gap-2">
          <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full font-semibold ${i <= stepIdx ? "bg-indigo-600 text-white" : "bg-slate-200 text-slate-500"}`}>{i < stepIdx ? "✓" : i + 1}</span>
          <span className={`hidden sm:inline ${i === stepIdx ? "font-medium text-slate-900" : "text-slate-500"}`}>{l}</span>
          {i < 4 && <span className={`h-px flex-1 ${i < stepIdx ? "bg-indigo-600" : "bg-slate-200"}`} />}
        </li>
      ))}
    </ol>
  );
  const wrap = (el: React.ReactNode) => <div>{Stepper}{el}</div>;

  if (step === "pick")
    return wrap(
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Choose your interview</h1>
        <p className="mt-1 text-sm text-slate-500">Pick the role you&apos;re interviewing for. You&apos;ll speak with an AI interviewer; it takes about 10 to 30 minutes.</p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {jobs.length === 0 && (
            <div className="card col-span-full flex flex-col items-center py-12 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-500"><IconBriefcase /></div>
              <p className="mt-3 font-medium">No interviews are open right now</p>
              <p className="text-sm text-slate-500">Check back soon, or use the link you were sent.</p>
            </div>
          )}
          {jobs.map((j) => (
            <button key={j.id} className="card card-hover group block w-full text-left" onClick={() => { setJob(j); setStep("details"); }}>
              <div className="flex items-start justify-between gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><IconBriefcase /></div>
                <IconArrow className="mt-1 h-5 w-5 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-indigo-500" />
              </div>
              <div className="mt-4 font-semibold">{j.title}</div>
              <div className="mt-1 text-sm text-slate-500">{j.department || "General"}</div>
              <div className="mt-3 flex gap-2"><span className="chip"><IconClock className="h-3.5 w-3.5" /> ~{j.settings.durationMin} min</span><span className="chip">{j.seniority}</span></div>
            </button>
          ))}
        </div>
      </div>
    );

  if (!job) return null;

  if (step === "details")
    return wrap(
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

  if (step === "check") return wrap(<MicCheck err={err} onReady={prepare} />);

  if (step === "preparing")
    return wrap(<div className="card py-12 text-center"><div className="orb mx-auto mb-5 h-16 w-16" data-state="thinking" /><p className="font-medium">Preparing your personalised questions…</p><p className="mt-1 text-sm text-slate-500">This takes about 15 seconds.</p></div>);

  if (step === "live") return wrap(<LiveInterview job={job} interviewId={interviewId.current} onTurns={onTurns} onFinished={onFinished} onStart={() => { candidate.saveTurns(interviewId.current, [], true).catch(() => {}); }} />);

  if (step === "wrapping")
    return wrap(<div className="card py-12 text-center"><div className="orb mx-auto mb-5 h-16 w-16" data-state="thinking" /><p className="font-medium">Wrapping up…</p><p className="mt-1 text-sm text-slate-500">Please keep this tab open for a moment while we save your interview.</p></div>);

  return wrap(
    <div className="card space-y-3 py-10 text-center">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-emerald-100 text-2xl text-emerald-600">✓</div>
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

  const [serverStt, setServerStt] = useState(false);
  useEffect(() => { serverSttAvailable().then(setServerStt); }, []);
  const supported = sttSupported() || serverStt;
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
