"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createListener, createSpeaker, englishVoices, onVoicesReady, serverVoiceAvailable, sttSupported,
  type Listener, type Speaker,
} from "@/lib/speech";
import { createVadListener, serverSttAvailable } from "@/lib/vad";
import type { Job, PlanQuestion, Turn } from "@/lib/types";

type Phase = "idle" | "speaking" | "listening" | "thinking" | "ended";

const PAUSE_MS = 850; // end-of-speech pause (PRD: ~0.7s)

export function LiveInterview({
  job, plan, onStart, onFinished,
}: {
  job: Job;
  plan: PlanQuestion[];
  onStart: () => void;
  onFinished: (r: { turns: Turn[]; durationSec: number; audio: Blob | null; abandoned: boolean }) => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [turnsView, setTurnsView] = useState<Turn[]>([]);
  const [live, setLive] = useState("");
  const [typed, setTyped] = useState("");
  const [rate, setRate] = useState(1.05);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceURI, setVoiceURI] = useState("");
  const [natural, setNatural] = useState(false);
  const [headphones, setHeadphones] = useState(false);
  const [err, setErr] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [heard, setHeard] = useState(false);
  const [serverStt, setServerStt] = useState<boolean | null>(null);
  const [transcribing, setTranscribing] = useState(false);

  const turns = useRef<Turn[]>([]);
  const t0 = useRef(0);
  const listener = useRef<Listener | null>(null);
  const speaker = useRef<Speaker | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const stream = useRef<MediaStream | null>(null);
  const audioCtx = useRef<AudioContext | null>(null);
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const nudged = useRef(false);
  const phaseRef = useRef<Phase>("idle");
  const hpRef = useRef(false);
  const finished = useRef(false);
  const failures = useRef(0);
  const turnId = useRef(0);
  const chatEnd = useRef<HTMLDivElement>(null);
  const canVoice = serverStt === true || sttSupported();
  const canVoiceRef = useRef(false);
  canVoiceRef.current = canVoice;
  useEffect(() => { serverSttAvailable().then(setServerStt); }, []);

  const setP = (p: Phase) => { phaseRef.current = p; setPhase(p); };
  useEffect(() => { hpRef.current = headphones; }, [headphones]);
  useEffect(() => { speaker.current?.setRate(rate); }, [rate]);
  useEffect(() => { if (voiceURI) speaker.current?.setVoice(voiceURI); }, [voiceURI]);
  useEffect(() => onVoicesReady(() => setVoices(englishVoices())), []);
  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [turnsView, live]);
  useEffect(() => {
    const id = setInterval(() => t0.current && setElapsed(Math.round((Date.now() - t0.current) / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  const sync = () => setTurnsView([...turns.current]);
  const addTurn = (speaker: Turn["speaker"], text: string) => {
    turns.current = [...turns.current, { speaker, text, at: Date.now() - t0.current }];
    sync();
  };
  const patchLastAi = (text: string) => {
    const last = turns.current[turns.current.length - 1];
    if (last?.speaker === "ai") { last.text = text; sync(); }
  };

  const finish = useCallback(
    async (abandoned: boolean) => {
      if (finished.current) return;
      finished.current = true;
      turnId.current++;
      setP("ended");
      clearTimeout(silenceTimer.current);
      listener.current?.stop();
      (listener.current as { destroy?: () => void } | null)?.destroy?.();
      speaker.current?.cancel();
      const audio = await new Promise<Blob | null>((res) => {
        const r = recorder.current;
        const mk = () => (chunks.current.length ? new Blob(chunks.current, { type: r?.mimeType || "audio/webm" }) : null);
        if (!r || r.state === "inactive") return res(mk());
        r.onstop = () => res(mk());
        r.stop();
      });
      stream.current?.getTracks().forEach((t) => t.stop());
      audioCtx.current?.close().catch(() => {});
      onFinished({ turns: turns.current, durationSec: Math.round((Date.now() - t0.current) / 1000), audio, abandoned });
    },
    [onFinished],
  );

  const beginListening = useCallback(() => {
    if (finished.current) return;
    setLive("");
    setHeard(false);
    setP("listening");
    if (canVoice) listener.current?.start();
    clearTimeout(silenceTimer.current);
    if (!nudged.current) silenceTimer.current = setTimeout(nudge, 10000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canVoice]);

  // After the AI finishes talking, start listening, unless this turn was interrupted or superseded.
  const thenListen = (myTurn: number, after?: () => void) =>
    speaker.current!.idle().then(() => {
      if (myTurn !== turnId.current || finished.current) return;
      if (after) return after();
      beginListening();
    });

  // Long silence: prompt gently once.
  function nudge() {
    if (phaseRef.current !== "listening" || finished.current) return;
    nudged.current = true;
    const myTurn = ++turnId.current;
    listener.current?.stop();
    setP("speaking");
    armBargeIn();
    speaker.current!.enqueue("Take your time. Would you like me to repeat the question?");
    thenListen(myTurn);
  }

  const interrupt = useCallback(() => {
    turnId.current++;
    speaker.current?.cancel();
    nudged.current = false;
    beginListening();
  }, [beginListening]);

  // With headphones, keep the mic armed while the AI talks so the candidate can talk over it.
  const armBargeIn = () => { if (hpRef.current && canVoiceRef.current) listener.current?.start(); };

  const submit = useCallback(async (text: string) => {
    if (phaseRef.current === "thinking" || finished.current) return;
    const myTurn = ++turnId.current;
    clearTimeout(silenceTimer.current);
    listener.current?.stop();
    speaker.current?.cancel();
    nudged.current = false;
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
      if (!r.ok || !r.body) throw new Error((await r.json().catch(() => ({}))).error || "AI error");
      failures.current = 0;

      // Stream the reply and speak it sentence by sentence as it arrives.
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let full = "";
      let spoken = 0; // chars of visible text already queued
      let started = false;
      const visible = () => full.split("<<")[0];
      const queueSentences = (final: boolean) => {
        const v = visible();
        const rest = v.slice(spoken);
        const m = rest.match(/^[\s\S]*?[.!?]["')\]]?(?=\s|$)/);
        const chunk = m ? m[0] : final ? rest : "";
        if (!chunk.trim()) return false;
        spoken += chunk.length;
        if (!started) { started = true; addTurn("ai", ""); setP("speaking"); armBargeIn(); }
        speaker.current!.enqueue(chunk.trim());
        patchLastAi(v.slice(0, spoken).trim());
        return true;
      };
      for (;;) {
        const { done, value } = await reader.read();
        if (myTurn !== turnId.current) { reader.cancel().catch(() => {}); return; }
        if (done) break;
        full += dec.decode(value, { stream: true });
        while (queueSentences(false));
      }
      while (queueSentences(true));
      const over = /<<(END|ABUSE)>>/.test(full) || elapsedSec > job.settings.durationMin * 60 + 120;
      thenListen(myTurn, over ? () => finish(false) : undefined);
    } catch (e) {
      if (myTurn !== turnId.current) return;
      failures.current += 1;
      if (failures.current >= 3) { setErr((e as Error).message); return finish(true); }
      setP("speaking");
      speaker.current!.enqueue("Sorry, I had a brief connection problem. Could you say that again?");
      thenListen(myTurn);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job, plan, finish]);

  async function begin() {
    setErr("");
    // Create the speaker inside the click handler so audio is allowed to play.
    const server = await serverVoiceAvailable();
    setNatural(server);
    speaker.current = createSpeaker({ server, rate, voiceURI: voiceURI || undefined });
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      stream.current = s;
      const rec = new MediaRecorder(s);
      rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
      rec.start(2000);
      recorder.current = rec;
      // live mic level for the orb
      const ctx = new AudioContext();
      audioCtx.current = ctx;
      const an = ctx.createAnalyser();
      an.fftSize = 512;
      ctx.createMediaStreamSource(s).connect(an);
      const buf = new Uint8Array(an.fftSize);
      const tick = () => {
        if (finished.current) return;
        an.getByteTimeDomainData(buf);
        let peak = 0;
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
        setLevel(Math.min(1, peak / 70));
        requestAnimationFrame(tick);
      };
      tick();
    } catch {
      if (canVoice) return setErr("Microphone access is needed. Allow it in your browser's address bar and press Start again.");
    }
    t0.current = Date.now();
    onStart();
    const useServer = serverStt === true && !!stream.current;
    if (useServer) {
      listener.current = createVadListener({
        stream: stream.current!,
        pauseMs: 750,
        onSpeechStart: () => {
          setHeard(true);
          setLive("…");
          clearTimeout(silenceTimer.current);
          if (phaseRef.current === "speaking" && hpRef.current) interrupt();
        },
        onTranscribing: (b) => { setTranscribing(b); if (!b) setLive((l) => (l === "…" ? "" : l)); },
        onFinal: (t) => { if (phaseRef.current === "listening") submit(t); },
        onError: setErr,
      });
    } else if (sttSupported()) {
      listener.current = createListener({
        pauseMs: PAUSE_MS,
        onInterim: (t) => {
          setLive(t);
          clearTimeout(silenceTimer.current);
          if (phaseRef.current === "speaking" && hpRef.current && t.split(/\s+/).length >= 2) interrupt();
        },
        onStatus: (st) => st === "heard-speech" && setHeard(true),
        onFinal: (t) => { if (phaseRef.current === "listening") submit(t); },
        onError: setErr,
      });
    }
    const myTurn = ++turnId.current;
    const greeting = `Hello, I'm your AI interviewer for the ${job.title} position. Are you ready to start your interview?`;
    addTurn("ai", greeting);
    setP("speaking");
    armBargeIn();
    speaker.current.enqueue(greeting);
    thenListen(myTurn);
  }

  useEffect(() => () => {
    finished.current = true;
    listener.current?.stop();
    (listener.current as { destroy?: () => void } | null)?.destroy?.();
    speaker.current?.cancel();
    stream.current?.getTracks().forEach((t) => t.stop());
  }, []);

  const mm = `${Math.floor(elapsed / 60)}:${String(elapsed % 60).padStart(2, "0")}`;
  const budget = job.settings.durationMin * 60;
  const pct = Math.min(100, (elapsed / budget) * 100);

  if (phase === "idle")
    return (
      <div className="room mx-auto max-w-xl rounded-3xl p-8 text-center text-white sm:p-10">
        <div className="orb mx-auto mb-6 h-28 w-28" data-state="idle" />
        <h1 className="text-2xl font-semibold">Your interview is ready</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm text-slate-300">
          The interviewer will greet you and ask if you&apos;re ready. Just answer out loud. It takes about {job.settings.durationMin} minutes.
        </p>
        <ul className="mx-auto mt-5 max-w-sm space-y-1 text-left text-xs text-slate-400">
          <li>• Find a quiet spot. Headphones help a lot.</li>
          <li>• Pause when you&apos;re done and it will respond.</li>
          <li>• Tap the glowing circle any time to interrupt or finish your answer.</li>
        </ul>
        {err && <p className="mt-4 text-sm text-red-300">{err}</p>}
        <button className="mt-7 w-full rounded-xl bg-white px-6 py-3 font-semibold text-slate-900 transition hover:bg-slate-100" onClick={begin}>
          Start interview
        </button>
      </div>
    );

  const status: Record<Phase, string> = {
    idle: "", speaking: "Interviewer is speaking", thinking: "Thinking…", ended: "Wrapping up…",
    listening: canVoice ? (transcribing ? "Got it, transcribing…" : heard ? "Listening…" : "Your turn — go ahead and speak") : "Your turn — type your answer",
  };
  const orbHint =
    phase === "speaking" ? "Tap to interrupt" : phase === "listening" && live ? "Tap to send now" : phase === "listening" ? "Tap to talk" : "";

  return (
    <div className="room overflow-hidden rounded-3xl text-white">
      <div className="h-1 w-full bg-white/10"><div className="h-1 bg-gradient-to-r from-indigo-400 to-fuchsia-400 transition-all" style={{ width: `${pct}%` }} /></div>
      <div className="flex items-center justify-between px-5 py-3 text-xs text-slate-300">
        <span className="flex items-center gap-2"><span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> Recording · {mm} / {job.settings.durationMin}:00</span>
        <span>{job.title}</span>
      </div>

      <div className="grid gap-0 lg:grid-cols-[1fr_1.1fr]">
        <div className="flex flex-col items-center justify-center px-6 py-8">
          <button
            aria-label={orbHint || status[phase]}
            className="orb h-44 w-44 cursor-pointer"
            data-state={phase}
            style={{ ["--lvl" as string]: phase === "listening" ? level : 0 }}
            onClick={() => {
              if (phase === "speaking") interrupt();
              else if (phase === "listening" && live) listener.current?.commit();
              else if (phase === "listening" && canVoice) { listener.current?.stop(); listener.current?.start(); }
            }}
          />
          <p className="mt-6 text-lg font-medium" aria-live="polite">{status[phase]}</p>
          <p className="mt-1 h-4 text-xs text-slate-400">{orbHint}</p>
          {canVoice && phase === "listening" && (
            <div className="mt-4 flex h-6 items-end gap-1" aria-hidden>
              {Array.from({ length: 14 }).map((_, i) => (
                <span key={i} className="w-1 rounded bg-emerald-400/80 transition-all" style={{ height: `${4 + Math.max(0, level * 22 * Math.sin((i / 13) * Math.PI)) }px` }} />
              ))}
            </div>
          )}
          {err && <p className="mt-4 max-w-xs text-center text-sm text-red-300">{err}</p>}
        </div>

        <div className="flex h-[26rem] flex-col border-t border-white/10 bg-black/20 lg:h-[30rem] lg:border-l lg:border-t-0">
          <div className="flex-1 space-y-3 overflow-y-auto p-5" aria-live="polite">
            {turnsView.map((t, i) => (
              <div key={i} className={`flex ${t.speaker === "ai" ? "justify-start" : "justify-end"}`}>
                <div className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${t.speaker === "ai" ? "rounded-bl-sm bg-white/10" : "rounded-br-sm bg-indigo-500"}`}>{t.text}</div>
              </div>
            ))}
            {live && <div className="flex justify-end"><div className="max-w-[85%] rounded-2xl rounded-br-sm bg-indigo-500/50 px-4 py-2.5 text-sm italic">{live}</div></div>}
            <div ref={chatEnd} />
          </div>
          <form className="flex gap-2 border-t border-white/10 p-3" onSubmit={(e) => { e.preventDefault(); const t = typed.trim(); if (t && phaseRef.current !== "thinking") { setTyped(""); submit(t); } }}>
            <input className="flex-1 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm text-white placeholder:text-slate-400 outline-none focus:border-indigo-400" placeholder="Or type your answer…" value={typed} onChange={(e) => setTyped(e.target.value)} />
            <button className="rounded-xl bg-white/15 px-4 text-sm font-medium hover:bg-white/25" type="submit">Send</button>
          </form>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/10 px-5 py-3 text-xs text-slate-300">
        {!natural && voices.length > 0 && (
          <label className="flex items-center gap-2">Voice
            <select className="max-w-40 rounded-lg border border-white/15 bg-slate-900 px-2 py-1" value={voiceURI} onChange={(e) => setVoiceURI(e.target.value)}>
              <option value="">Auto (best)</option>
              {voices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>)}
            </select>
          </label>
        )}
        {serverStt && <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-emerald-300">HD listening</span>}
        {natural && <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-emerald-300">Natural voice on</span>}
        <label className="flex items-center gap-2">Speed
          <select className="rounded-lg border border-white/15 bg-slate-900 px-2 py-1" value={rate} onChange={(e) => setRate(Number(e.target.value))}>
            {[0.9, 1, 1.05, 1.2, 1.35].map((r) => <option key={r} value={r}>{r}×</option>)}
          </select>
        </label>
        {canVoice && <label className="flex items-center gap-2"><input type="checkbox" checked={headphones} onChange={(e) => setHeadphones(e.target.checked)} /> I&apos;m wearing headphones (talk over the AI)</label>}
        <button className="ml-auto rounded-lg bg-red-500/90 px-4 py-1.5 font-medium text-white hover:bg-red-500" onClick={() => confirm("End the interview now?") && finish(true)}>End interview</button>
      </div>
    </div>
  );
}
