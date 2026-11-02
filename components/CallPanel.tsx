"use client";
import { useEffect, useRef, useState } from "react";
import { Logo } from "./Logo";

export type CallPhase = "idle" | "ringing" | "speaking" | "listening" | "thinking" | "ended";
export type CallLine = { speaker: "ai" | "caller"; text: string };

export type CallPanelProps = {
  phase: CallPhase;
  lines: CallLine[];
  context: string;
  muted: boolean;
  headphones: boolean;
  showText: boolean;
  elapsed: number;
  level: number;
  err: string;
  onContext: (v: string) => void;
  onStart: () => void;
  onHangUp: () => void;
  onMute: () => void;
  onHeadphones: () => void;
  onToggleText: () => void;
  onClose?: () => void;
};

export const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

const I = {
  phone: "M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.6a1 1 0 0 1-.25 1z",
};
const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function Phone({ className = "h-5 w-5", down }: { className?: string; down?: boolean }) {
  return <svg viewBox="0 0 24 24" className={`${className} ${down ? "rotate-[135deg]" : ""}`} fill="currentColor" aria-hidden><path d={I.phone} /></svg>;
}
const MicIcon = ({ off }: { off?: boolean }) => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" {...stroke} aria-hidden>
    <rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" />{off && <path d="M4 4l16 16" />}
  </svg>
);
const HeadphonesIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" {...stroke} aria-hidden>
    <path d="M4 15v-3a8 8 0 0 1 16 0v3" /><rect x="3" y="14" width="4" height="6" rx="1.5" /><rect x="17" y="14" width="4" height="6" rx="1.5" />
  </svg>
);
const CaptionsIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" {...stroke} aria-hidden>
    <rect x="3" y="5" width="18" height="14" rx="3" /><path d="M7 11h4M13 11h4M7 15h2M11 15h6" />
  </svg>
);
const CloseIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" {...stroke} aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
);
const LockIcon = () => (
  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" {...stroke} aria-hidden><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
);

const SUGGESTIONS = [
  "How does a group loan work?",
  "Is this OTP call a scam?",
  "What affects my loan interest?",
];

function Avatar({ live }: { live?: boolean }) {
  return (
    <div className="relative">
      <Logo size={40} />
      {live && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-[#0b1020] bg-emerald-400" />}
    </div>
  );
}

function Bars({ active, level }: { active: boolean; level: number }) {
  const hs = [0.35, 0.65, 1, 0.65, 0.35];
  return (
    <div className="flex h-6 items-center justify-center gap-1" aria-hidden>
      {hs.map((h, i) => (
        <span
          key={i}
          className="w-1 rounded-full bg-white/70 transition-all duration-150"
          style={{
            height: `${Math.round((active ? 6 + h * (6 + level * 14) : 4) * 10) / 10}px`,
            animation: active && level === 0 ? `bar-bounce 0.9s ease-in-out ${i * 0.12}s infinite` : undefined,
          }}
        />
      ))}
    </div>
  );
}

function Typing() {
  return <span className="typing inline-flex gap-1"><i /><i /><i /></span>;
}

export function CallPanel(p: CallPanelProps) {
  const logRef = useRef<HTMLDivElement>(null);
  const [details, setDetails] = useState(false);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" }); }, [p.lines, p.phase]);

  const inCall = p.phase !== "idle" && p.phase !== "ended";

  /* ---------- Before / after the call ---------- */
  if (!inCall) {
    const ended = p.phase === "ended";
    const exchanges = p.lines.filter((l) => l.speaker === "caller").length;
    return (
      <div className="room call-pop relative rounded-3xl p-6 text-white sm:p-8">
        {p.onClose && <button onClick={p.onClose} aria-label="Close" className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full text-slate-400 hover:bg-white/10 hover:text-white"><CloseIcon /></button>}
        <div className="flex items-center gap-3">
          <Avatar />
          <div className="text-left">
            <p className="text-sm font-semibold leading-tight">Banking &amp; Finance Support</p>
            <p className="text-xs text-slate-400">AI voice assistant · Available now</p>
          </div>
        </div>

        {ended ? (
          <div className="mt-8 text-center">
            <div className="orb mx-auto h-20 w-20" data-state="idle" />
            <h2 className="mt-5 text-xl font-semibold tracking-tight">Call ended</h2>
            <p className="mt-1 text-sm text-slate-300">
              {fmtTime(p.elapsed)} · {exchanges} {exchanges === 1 ? "question" : "questions"} asked
            </p>
          </div>
        ) : (
          <>
            <h2 className="mt-8 text-2xl font-semibold tracking-tight">Talk to a person-like assistant</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              Ask about banking, loans, savings and microfinance, or anything else on your mind. Speak naturally and interrupt whenever you like.
            </p>
            <div className="mt-5">
              <p className="mb-2 text-[11px] font-medium uppercase tracking-widest text-slate-500">Try asking</p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTIONS.map((s) => (
                  <span key={s} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300">“{s}”</span>
                ))}
              </div>
            </div>
            <div className="mt-5">
              <button type="button" onClick={() => setDetails((d) => !d)} className="text-xs font-medium text-indigo-300 hover:text-indigo-200">
                {details || p.context ? "Hide" : "Add"} bank details (optional)
              </button>
              {(details || p.context) && (
                <textarea
                  value={p.context} onChange={(e) => p.onContext(e.target.value)} rows={3}
                  placeholder="e.g. You support customers of Sunrise Microfinance Bank: savings, group loans and transfers. Branches open 8–4."
                  className="mt-2 w-full resize-none rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none"
                />
              )}
            </div>
          </>
        )}

        {p.err && <p className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300" role="alert">{p.err}</p>}
        <button onClick={p.onStart} className="mt-6 flex w-full items-center justify-center gap-2.5 rounded-2xl bg-emerald-500 px-6 py-3.5 text-base font-semibold text-white shadow-lg shadow-emerald-900/30 transition hover:bg-emerald-400 active:scale-[0.99]">
          <Phone /> {ended ? "Call again" : "Start call"}
        </button>
        <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-slate-400"><LockIcon /> You&apos;re speaking with an AI. Never share PINs or OTPs. Headphones recommended.</p>
      </div>
    );
  }

  /* ---------- In call ---------- */
  const status =
    p.phase === "ringing" ? "Calling…" :
    p.muted ? "You're muted" :
    p.phase === "speaking" ? "Speaking" :
    p.phase === "thinking" ? "Thinking" : "Listening";
  const orbState = p.phase === "ringing" ? "thinking" : p.phase;
  const lastAi = p.lines.length && p.lines[p.lines.length - 1].speaker === "ai" && p.lines[p.lines.length - 1].text;

  return (
    <div className="room call-pop relative flex min-h-[34rem] flex-col rounded-3xl p-5 text-white sm:p-6">
      <div className="flex items-center gap-3">
        <Avatar live />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold leading-tight">Banking &amp; Finance Support</p>
          <p className="flex items-center gap-1.5 text-xs text-slate-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> {p.phase === "ringing" ? "Connecting" : "Connected"} · <span className="font-mono">{fmtTime(p.elapsed)}</span>
          </p>
        </div>
        {p.onClose && <button onClick={p.onClose} aria-label="Minimise" className="grid h-8 w-8 place-items-center rounded-full text-slate-400 hover:bg-white/10 hover:text-white"><CloseIcon /></button>}
      </div>

      <div className="grid flex-1 place-items-center py-5">
        <div className="text-center">
          <div
            className="orb mx-auto h-32 w-32 sm:h-36 sm:w-36"
            data-state={orbState}
            style={{ ["--lvl" as string]: p.phase === "listening" && !p.muted ? p.level : 0 }}
          />
          <p className="mt-5 text-sm font-medium text-slate-200" aria-live="polite">{status}</p>
          <div className="mt-2"><Bars active={p.phase === "speaking" || (p.phase === "listening" && !p.muted)} level={p.phase === "listening" ? p.level : 0} /></div>
          {p.err && <p className="mx-auto mt-3 max-w-xs rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300" role="alert">{p.err}</p>}
        </div>
      </div>

      {p.showText && (
        <div ref={logRef} className="call-log mb-4 max-h-44 space-y-2 overflow-y-auto pr-1">
          {p.lines.length === 0 && <p className="text-center text-xs text-slate-500">Captions will appear here</p>}
          {p.lines.map((l, i) => (
            <div key={i} className={`flex ${l.speaker === "caller" ? "justify-end" : "justify-start"}`}>
              <p className={`max-w-[85%] rounded-2xl px-3.5 py-2 text-[13px] leading-snug ${l.speaker === "caller" ? "rounded-br-md bg-indigo-500/90 text-white" : "rounded-bl-md bg-white/10 text-slate-100"}`}>
                {l.text || <Typing />}
              </p>
            </div>
          ))}
          {p.phase === "thinking" && !lastAi && (
            <div className="flex justify-start"><p className="rounded-2xl rounded-bl-md bg-white/10 px-3.5 py-2.5"><Typing /></p></div>
          )}
        </div>
      )}

      <div className="flex items-start justify-center gap-4 sm:gap-5">
        <Ctl label={p.muted ? "Unmute" : "Mute"} on={p.muted} onClick={p.onMute}><MicIcon off={p.muted} /></Ctl>
        <Ctl label="Headphones" on={p.headphones} onClick={p.onHeadphones} title="On: interrupt instantly. Use only with headphones."><HeadphonesIcon /></Ctl>
        <Ctl label="Captions" on={p.showText} onClick={p.onToggleText}><CaptionsIcon /></Ctl>
        <div className="flex flex-col items-center gap-1.5">
          <button onClick={p.onHangUp} aria-label="End call" className="grid h-14 w-14 place-items-center rounded-full bg-red-500 text-white shadow-lg shadow-red-900/40 transition hover:bg-red-400 active:scale-95"><Phone down /></button>
          <span className="text-[11px] text-slate-400">End</span>
        </div>
      </div>
    </div>
  );
}

function Ctl({ label, on, onClick, children, title }: { label: string; on: boolean; onClick: () => void; children: React.ReactNode; title?: string }) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <button onClick={onClick} aria-pressed={on} aria-label={label} title={title} className={`grid h-14 w-14 place-items-center rounded-full transition active:scale-95 ${on ? "bg-white text-slate-900" : "bg-white/10 text-white hover:bg-white/20"}`}>
        {children}
      </button>
      <span className="text-[11px] text-slate-400">{label}</span>
    </div>
  );
}
