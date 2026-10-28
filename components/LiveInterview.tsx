"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createListener, speak, sttSupported, type Listener } from "@/lib/speech";
import type { Job, PlanQuestion, Turn } from "@/lib/types";

type Phase = "idle" | "speaking" | "listening" | "thinking" | "ended";

export function LiveInterview({
  job, plan, onStart, onFinished,
}: {
  job: Job;
  plan: PlanQuestion[];
  onStart: () => void;
  onFinished: (r: { turns: Turn[]; durationSec: number; audio: Blob | null; abandoned: boolean }) => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [captions, setCaptions] = useState("");
  const [live, setLive] = useState("");
  const [typed, setTyped] = useState("");
  const [rate, setRate] = useState(1);
  const [headphones, setHeadphones] = useState(false);
  const [err, setErr] = useState("");
  const [elapsed, setElapsed] = useState(0);

  const turns = useRef<Turn[]>([]);
  const t0 = useRef(0);
  const listener = useRef<Listener | null>(null);
  const current = useRef<{ cancel: () => void } | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const nudged = useRef(false);
  const phaseRef = useRef<Phase>("idle");
  const rateRef = useRef(1);
  const hpRef = useRef(false);
  const finished = useRef(false);
  const failures = useRef(0);
  const canVoice = sttSupported();

  const setP = (p: Phase) => { phaseRef.current = p; setPhase(p); };
  useEffect(() => { rateRef.current = rate; }, [rate]);
  useEffect(() => { hpRef.current = headphones; }, [headphones]);
  useEffect(() => {
    const id = setInterval(() => t0.current && setElapsed(Math.round((Date.now() - t0.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  const addTurn = (speaker: Turn["speaker"], text: string) => {
    turns.current = [...turns.current, { speaker, text, at: Date.now() - t0.current }];
  };

  const finish = useCallback(
    async (abandoned: boolean) => {
      if (finished.current) return;
      finished.current = true;
      setP("ended");
      clearTimeout(silenceTimer.current);
      listener.current?.stop();
      speechSynthesis.cancel();
      const audio = await new Promise<Blob | null>((res) => {
        const r = recorder.current;
        if (!r || r.state === "inactive") return res(chunks.current.length ? new Blob(chunks.current, { type: "audio/webm" }) : null);
        r.onstop = () => res(chunks.current.length ? new Blob(chunks.current, { type: r.mimeType || "audio/webm" }) : null);
        r.stop();
      });
      stream.current?.getTracks().forEach((t) => t.stop());
      onFinished({ turns: turns.current, durationSec: Math.round((Date.now() - t0.current) / 1000), audio, abandoned });
    },
    [onFinished],
  );

  const startListening = useCallback(() => {
    if (finished.current) return;
    setLive("");
    nudged.current = false;
    setP("listening");
    if (canVoice) listener.current?.start();
    clearTimeout(silenceTimer.current);
    silenceTimer.current = setTimeout(nudge, 10000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canVoice]);

  // Long silence: prompt gently once, then offer to repeat.
  function nudge() {
    if (phaseRef.current !== "listening" || finished.current) return;
    if (nudged.current) return;
    nudged.current = true;
    sayLocal("Take your time. Would you like me to repeat the question?", false);
  }

  function sayLocal(text: string, record = true, then?: () => void) {
    listener.current?.stop();
    setCaptions(text);
    if (record) addTurn("ai", text);
    setP("speaking");
    const s = speak(text, rateRef.current);
    current.current = s;
    if (hpRef.current && canVoice) listener.current?.start(); // allow talk-over
    s.done.then(() => {
      if (current.current !== s || finished.current) return;
      current.current = null;
      if (then) return then();
      if (phaseRef.current === "speaking") startListening();
    });
  }

  const submit = useCallback(async (text: string) => {
    if (phaseRef.current === "thinking" || finished.current) return;
    clearTimeout(silenceTimer.current);
    listener.current?.stop();
    addTurn("candidate", text);
    setLive("");
    setP("thinking");
    const elapsedSec = (Date.now() - t0.current) / 1000;
    try {
      const r = await fetch("/api/turn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ job, plan, turns: turns.current, elapsedSec }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "AI error");
      failures.current = 0;
      const over = j.end || j.abuse || elapsedSec > job.settings.durationMin * 60 + 120;
      sayLocal(j.say, true, over ? () => finish(false) : undefined);
    } catch (e) {
      failures.current += 1;
      if (failures.current >= 3) { setErr((e as Error).message); return finish(true); }
      sayLocal("Sorry, I had a brief connection problem. Could you repeat that?", false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job, plan, finish]);

  async function begin() {
    setErr("");
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      stream.current = s;
      const rec = new MediaRecorder(s);
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.start(2000);
      recorder.current = rec;
    } catch {
      if (canVoice) return setErr("Microphone access is needed to record the interview.");
    }
    t0.current = Date.now();
    onStart();
    if (canVoice) {
      listener.current = createListener({
        pauseMs: 1400,
        onInterim: (t) => {
          setLive(t);
          clearTimeout(silenceTimer.current);
          // Barge-in: candidate talks over the AI (headphones mode only, to avoid echo).
          if (phaseRef.current === "speaking" && t.split(/\s+/).length >= 2) {
            current.current?.cancel();
            current.current = null;
            setP("listening");
          }
        },
        onFinal: (t) => { if (phaseRef.current === "listening") submit(t); },
        onError: setErr,
      });
    }
    const greeting = `Hello, I'm your AI interviewer for the ${job.title} position. Are you ready to start your interview?`;
    sayLocal(greeting);
  }

  useEffect(() => () => {
    finished.current = true;
    listener.current?.stop();
    speechSynthesis.cancel();
    stream.current?.getTracks().forEach((t) => t.stop());
  }, []);

  const mm = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;
  const label: Record<Phase, string> = {
    idle: "Ready when you are", speaking: "Interviewer is speaking…", listening: canVoice ? "Listening, go ahead" : "Your turn: type your answer",
    thinking: "Thinking…", ended: "Ending…",
  };

  if (phase === "idle")
    return (
      <div className="card space-y-4 text-center">
        <h1 className="text-2xl font-semibold">Your questions are ready</h1>
        <p className="text-neutral-600">When you press start, the interviewer will greet you and ask if you&apos;re ready. Just answer out loud.</p>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button className="btn-primary" onClick={begin}>Start interview</button>
      </div>
    );

  return (
    <div className="space-y-4">
      <div className="card text-center">
        <div className={`mx-auto grid h-24 w-24 place-items-center rounded-full text-white transition ${phase === "speaking" ? "bg-accent animate-pulse" : phase === "listening" ? "bg-emerald-500 animate-pulse" : "bg-neutral-400"}`}>
          {phase === "listening" ? "🎙" : phase === "speaking" ? "🔊" : "…"}
        </div>
        <p className="mt-3 font-medium">{label[phase]}</p>
        <p className="text-xs text-neutral-500">Elapsed {mm} · planned {job.settings.durationMin} min</p>
      </div>

      <div className="card min-h-24" aria-live="polite">
        <div className="label">Interviewer (captions)</div>
        <p>{captions}</p>
        {live && <><div className="label mt-3">You</div><p className="text-neutral-600">{live}</p></>}
      </div>

      <div className="card flex flex-wrap items-center gap-3 text-sm">
        <form className="flex flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); if (typed.trim() && phaseRef.current !== "thinking") { current.current?.cancel(); const t = typed.trim(); setTyped(""); submit(t); } }}>
          <input className="input" placeholder="Prefer to type? Enter your answer here" value={typed} onChange={(e) => setTyped(e.target.value)} />
          <button className="btn-ghost" type="submit">Send</button>
        </form>
        {phase === "speaking" && <button className="btn-ghost" onClick={() => { current.current?.cancel(); current.current = null; startListening(); }}>Interrupt</button>}
        <label className="flex items-center gap-1">Speed
          <select className="input w-auto" value={rate} onChange={(e) => setRate(Number(e.target.value))}>
            {[0.8, 1, 1.15, 1.3].map((r) => <option key={r} value={r}>{r}×</option>)}
          </select>
        </label>
        {canVoice && <label className="flex items-center gap-1"><input type="checkbox" checked={headphones} onChange={(e) => setHeadphones(e.target.checked)} /> Headphones (talk over the AI)</label>}
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <button className="btn-ghost" onClick={() => confirm("End the interview now?") && finish(true)}>End interview</button>
    </div>
  );
}
