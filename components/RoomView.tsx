"use client";
import { useEffect, useRef, useState } from "react";
import { IconCheck, IconLock, IconMic } from "./icons";
import type { Turn } from "@/lib/types";

export type RoomPhase = "idle" | "speaking" | "listening" | "thinking" | "ended";

export type RoomProps = {
  title: string;
  durationMin: number;
  phase: RoomPhase;
  turns: Turn[];
  live: string;
  level: number;
  elapsed: number;
  canVoice: boolean;
  transcribing: boolean;
  heard: boolean;
  natural: boolean;
  serverStt: boolean;
  voices: { voiceURI: string; name: string }[];
  voiceURI: string;
  rate: number;
  headphones: boolean;
  err: string;
  onVoice: (v: string) => void;
  onRate: (r: number) => void;
  onHeadphones: (b: boolean) => void;
  onOrb: () => void;
  onSend: (text: string) => void;
  onEnd: () => void;
};

export function IdleView({ title, durationMin, err, onStart }: { title: string; durationMin: number; err: string; onStart: () => void }) {
  return (
    <div className="room mx-auto max-w-xl rounded-3xl p-8 text-center text-white sm:p-10">
      <div className="orb mx-auto mb-6 h-28 w-28" data-state="idle" />
      <p className="text-xs font-medium uppercase tracking-widest text-indigo-300">{title}</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Your interview is ready</h1>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-300">
        The interviewer will greet you and ask if you&apos;re ready. Just answer out loud. It takes about {durationMin} minutes.
      </p>
      <ul className="mx-auto mt-6 max-w-sm space-y-2.5 text-left text-sm text-slate-300">
        {[
          "Find a quiet spot. Headphones help a lot.",
          "Pause when you're done and it will respond.",
          "Tap the glowing circle to interrupt or send your answer.",
        ].map((t) => (
          <li key={t} className="flex items-start gap-3"><span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-500/20 text-emerald-300"><IconCheck className="h-3 w-3" /></span>{t}</li>
        ))}
      </ul>
      <p className="mx-auto mt-6 flex max-w-sm items-center justify-center gap-2 text-xs text-slate-400"><IconLock className="h-3.5 w-3.5" /> You&apos;re speaking with an AI. This call is recorded.</p>
      {err && <p className="mt-4 text-sm text-red-300">{err}</p>}
      <button className="mt-6 w-full rounded-xl bg-white px-6 py-3 font-semibold text-slate-900 transition hover:bg-slate-100 active:scale-[0.99]" onClick={onStart}>
        Start interview
      </button>
    </div>
  );
}

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export function RoomView(p: RoomProps) {
  const [typed, setTyped] = useState("");
  const [confirmEnd, setConfirmEnd] = useState(false);
  const chatEnd = useRef<HTMLDivElement>(null);
  useEffect(() => { chatEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [p.turns, p.live, p.phase]);
  useEffect(() => { if (!confirmEnd) return; const t = setTimeout(() => setConfirmEnd(false), 4000); return () => clearTimeout(t); }, [confirmEnd]);

  const pct = Math.min(100, (p.elapsed / (p.durationMin * 60)) * 100);
  const status =
    p.phase === "speaking" ? "Interviewer is speaking"
    : p.phase === "thinking" ? "Thinking"
    : p.phase === "ended" ? "Wrapping up"
    : p.canVoice ? (p.transcribing ? "Got it, transcribing" : p.heard ? "Listening" : "Your turn: go ahead and speak")
    : "Your turn: type your answer";
  const hint =
    p.phase === "speaking" ? "Tap the circle to interrupt"
    : p.phase === "listening" && p.live ? "Tap the circle to send now"
    : p.phase === "listening" && p.canVoice ? "Tap the circle to talk" : "";
  const tone = p.phase === "listening" ? "emerald" : p.phase === "speaking" ? "indigo" : "slate";

  return (
    <div className="room overflow-hidden rounded-3xl text-white">
      {/* top bar */}
      <div className="flex items-center justify-between gap-3 px-5 py-3 text-xs text-slate-300">
        <span className="flex items-center gap-2 rounded-full bg-white/5 px-3 py-1.5"><span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> REC <span className="tabular-nums">{mmss(p.elapsed)}</span> <span className="text-slate-500">/ {p.durationMin}:00</span></span>
        <span className="truncate font-medium text-slate-200">{p.title}</span>
      </div>
      <div className="h-0.5 w-full bg-white/10"><div className="h-0.5 bg-gradient-to-r from-indigo-400 to-fuchsia-400 transition-all" style={{ width: `${pct}%` }} /></div>

      <div className="grid lg:grid-cols-[1fr_1.15fr]">
        {/* stage */}
        <div className="flex flex-col items-center justify-center px-6 py-10">
          <div className="relative grid place-items-center">
            <span className={`absolute h-64 w-64 rounded-full blur-3xl transition-colors duration-500 ${tone === "emerald" ? "bg-emerald-500/20" : tone === "indigo" ? "bg-indigo-500/25" : "bg-slate-500/10"}`} />
            <button
              aria-label={hint || status}
              className="orb relative h-44 w-44 cursor-pointer"
              data-state={p.phase}
              style={{ ["--lvl" as string]: p.phase === "listening" ? p.level : 0 }}
              onClick={p.onOrb}
            >
              {p.phase === "listening" && <IconMic className="mx-auto h-9 w-9 text-white/90 drop-shadow" />}
            </button>
          </div>
          <div className={`mt-8 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${tone === "emerald" ? "bg-emerald-500/15 text-emerald-300" : tone === "indigo" ? "bg-indigo-500/20 text-indigo-200" : "bg-white/10 text-slate-300"}`} aria-live="polite">
            {p.phase === "thinking" && <span className="typing"><i /><i /><i /></span>}
            {status}
          </div>
          <p className="mt-2 h-4 text-xs text-slate-400">{hint}</p>
          {p.canVoice && (
            <div className={`mt-3 flex h-7 items-end gap-1 transition-opacity ${p.phase === "listening" ? "opacity-100" : "opacity-0"}`} aria-hidden>
              {Array.from({ length: 16 }).map((_, i) => (
                <span key={i} className="w-1 rounded-full bg-emerald-400/80 transition-all duration-100" style={{ height: `${Math.round(4 + Math.max(0, p.level * 24 * Math.sin((i / 15) * Math.PI)))}px` }} />
              ))}
            </div>
          )}
          {p.err && <p className="mt-4 max-w-xs rounded-lg bg-red-500/10 px-3 py-2 text-center text-sm text-red-300">{p.err}</p>}
        </div>

        {/* conversation */}
        <div className="flex h-[27rem] flex-col border-t border-white/10 bg-black/25 lg:h-[32rem] lg:border-l lg:border-t-0">
          <div className="border-b border-white/10 px-5 py-3 text-xs font-medium uppercase tracking-wide text-slate-400">Conversation</div>
          <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4" aria-live="polite">
            {p.turns.map((t, i) => (
              <div key={i} className={`flex gap-3 ${t.speaker === "ai" ? "" : "flex-row-reverse"}`}>
                <span className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-semibold ${t.speaker === "ai" ? "bg-indigo-500/30 text-indigo-200" : "bg-emerald-500/25 text-emerald-200"}`}>{t.speaker === "ai" ? "AI" : "You"}</span>
                <div className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${t.speaker === "ai" ? "rounded-tl-sm bg-white/10" : "rounded-tr-sm bg-indigo-500"}`}>{t.text}</div>
              </div>
            ))}
            {p.live && (
              <div className="flex flex-row-reverse gap-3">
                <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-emerald-500/25 text-[10px] font-semibold text-emerald-200">You</span>
                <div className="max-w-[82%] rounded-2xl rounded-tr-sm bg-indigo-500/45 px-4 py-2.5 text-sm italic">{p.live}</div>
              </div>
            )}
            {p.phase === "thinking" && !p.live && (
              <div className="flex gap-3"><span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-indigo-500/30 text-[10px] font-semibold text-indigo-200">AI</span><div className="rounded-2xl rounded-tl-sm bg-white/10 px-4 py-3"><span className="typing"><i /><i /><i /></span></div></div>
            )}
            <div ref={chatEnd} />
          </div>
          <form className="flex gap-2 border-t border-white/10 p-3" onSubmit={(e) => { e.preventDefault(); const t = typed.trim(); if (t) { setTyped(""); p.onSend(t); } }}>
            <input className="flex-1 rounded-xl border border-white/15 bg-white/5 px-3.5 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-indigo-400" placeholder="Or type your answer…" value={typed} onChange={(e) => setTyped(e.target.value)} />
            <button className="rounded-xl bg-white/15 px-4 text-sm font-medium transition hover:bg-white/25" type="submit">Send</button>
          </form>
        </div>
      </div>

      {/* controls */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-white/10 px-5 py-3 text-xs text-slate-300">
        {!p.natural && p.voices.length > 0 && (
          <label className="flex items-center gap-2">Voice
            <select className="max-w-40 rounded-lg border border-white/15 bg-slate-900 px-2 py-1.5" value={p.voiceURI} onChange={(e) => p.onVoice(e.target.value)}>
              <option value="">Auto (best)</option>
              {p.voices.map((v) => <option key={v.voiceURI} value={v.voiceURI}>{v.name}</option>)}
            </select>
          </label>
        )}
        <label className="flex items-center gap-2">Speed
          <select className="rounded-lg border border-white/15 bg-slate-900 px-2 py-1.5" value={p.rate} onChange={(e) => p.onRate(Number(e.target.value))}>
            {[0.9, 1, 1.05, 1.2, 1.35].map((r) => <option key={r} value={r}>{r}×</option>)}
          </select>
        </label>
        {p.canVoice && (
          <label className="flex cursor-pointer items-center gap-2"><input type="checkbox" className="accent-indigo-500" checked={p.headphones} onChange={(e) => p.onHeadphones(e.target.checked)} /> Let me interrupt the AI</label>
        )}
        <span className="flex gap-1.5">
          {p.natural && <span className="badge bg-emerald-500/15 text-emerald-300">Natural voice</span>}
          {p.serverStt && <span className="badge bg-emerald-500/15 text-emerald-300">HD listening</span>}
        </span>
        <button
          className={`ml-auto rounded-xl px-4 py-2 text-sm font-medium transition ${confirmEnd ? "bg-red-600 text-white" : "bg-white/10 text-slate-200 hover:bg-red-500/80 hover:text-white"}`}
          onClick={() => (confirmEnd ? p.onEnd() : setConfirmEnd(true))}
        >
          {confirmEnd ? "Tap again to end" : "End interview"}
        </button>
      </div>
    </div>
  );
}
