"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createSpeaker, serverVoiceAvailable, type Speaker } from "@/lib/speech";
import { createVadListener, serverSttAvailable, type VadListener } from "@/lib/vad";

type Phase = "idle" | "ringing" | "speaking" | "listening" | "thinking" | "ended";
type Line = { speaker: "ai" | "caller"; text: string };

const words = (t: string) => t.toLowerCase().replace(/[^a-z0-9' ]/g, " ").split(/\s+/).filter(Boolean);
const STOP = /\b(stop|wait|hold on|hang on|sorry|actually|no|pause)\b/i;

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

// Two short ringback pulses so it feels like placing a call.
function ring(): Promise<void> {
  return new Promise((res) => {
    try {
      const ctx = new AudioContext();
      const g = ctx.createGain();
      g.gain.value = 0;
      g.connect(ctx.destination);
      for (const f of [440, 480]) { const o = ctx.createOscillator(); o.frequency.value = f; o.connect(g); o.start(); }
      [0, 1.4].forEach((t) => { g.gain.setValueAtTime(0.06, ctx.currentTime + t); g.gain.setValueAtTime(0, ctx.currentTime + t + 0.9); });
      setTimeout(() => { ctx.close().catch(() => {}); res(); }, 2300);
    } catch { setTimeout(res, 1200); }
  });
}

export function CallView() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [lines, setLines] = useState<Line[]>([]);
  const [context, setContext] = useState("");
  const [muted, setMuted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [showText, setShowText] = useState(true);
  const [headphones, setHeadphones] = useState(false);
  const [err, setErr] = useState("");

  const phaseRef = useRef<Phase>("idle");
  const linesRef = useRef<Line[]>([]);
  const speaker = useRef<Speaker | null>(null);
  const vad = useRef<VadListener | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const mutedRef = useRef(false);
  const hpRef = useRef(false);
  hpRef.current = headphones;
  const turnId = useRef(0);
  const inflight = useRef<AbortController | null>(null);
  const t0 = useRef(0);
  const ended = useRef(false);
  const ctxRef = useRef("");
  const failures = useRef(0);
  const starting = useRef(false);
  const logRef = useRef<HTMLDivElement>(null);
  ctxRef.current = context;

  const setP = (p: Phase) => { phaseRef.current = p; setPhase(p); vad.current?.setSpeaking(p === "speaking"); };
  const sync = () => setLines([...linesRef.current]);
  const add = (speakerName: Line["speaker"], text: string) => { linesRef.current = [...linesRef.current, { speaker: speakerName, text }]; sync(); };
  const patchAi = (text: string) => { const l = linesRef.current[linesRef.current.length - 1]; if (l?.speaker === "ai") { l.text = text; sync(); } };

  useEffect(() => {
    const id = setInterval(() => { if (t0.current && !ended.current) setElapsed(Math.round((Date.now() - t0.current) / 1000)); }, 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => { logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" }); }, [lines]);

  const hangUp = useCallback(() => {
    if (ended.current) return;
    ended.current = true;
    starting.current = false;
    turnId.current++;
    inflight.current?.abort();
    speaker.current?.cancel();
    vad.current?.destroy();
    stream.current?.getTracks().forEach((t) => t.stop());
    setP("ended");
  }, []);

  const listen = () => { if (!ended.current) { setP("listening"); if (!mutedRef.current) vad.current?.start(); } };
  const thenListen = (myTurn: number, after?: () => void) =>
    speaker.current!.idle().then(() => { if (myTurn !== turnId.current || ended.current) return; if (after) after(); else listen(); });

  const speakInterrupt = () => { turnId.current++; speaker.current?.cancel(); listen(); };

  const respond = useCallback(async () => {
    const myTurn = ++turnId.current;
    setP("thinking");
    try {
      const ac = new AbortController();
      inflight.current = ac;
      const r = await fetch("/api/call", {
        signal: ac.signal, method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ turns: linesRef.current, context: ctxRef.current }),
      });
      if (!r.ok || !r.body) throw new Error((await r.json().catch(() => ({}))).error || "AI error");
      failures.current = 0;
      const reader = r.body.getReader();
      const dec = new TextDecoder();
      let full = "", spoken = 0, started = false;
      const visible = () => full.split("<<")[0];
      const queue = (final: boolean) => {
        const v = visible();
        const rest = v.slice(spoken);
        const m = rest.match(/^[\s\S]*?[.!?]["')\]]?(?=\s|$)/) ?? (!started ? rest.match(/^[\s\S]{18,}?[,;:](?=\s)/) : null);
        const chunk = m ? m[0] : final ? rest : "";
        if (!chunk.trim()) return false;
        spoken += chunk.length;
        if (!started) { started = true; add("ai", ""); setP("speaking"); }
        speaker.current!.enqueue(chunk.trim());
        patchAi(v.slice(0, spoken).trim());
        return true;
      };
      for (;;) {
        const { done, value } = await reader.read();
        if (myTurn !== turnId.current) { reader.cancel().catch(() => {}); return; }
        if (done) break;
        full += dec.decode(value, { stream: true });
        while (queue(false));
      }
      while (queue(true));
      if (!started || /<<ERR>>/.test(full)) throw new Error("The assistant did not answer");
      thenListen(myTurn, /<<END>>/.test(full) ? hangUp : undefined);
    } catch (e) {
      if (myTurn !== turnId.current || ended.current) return;
      if (++failures.current >= 3) { setErr((e as Error).message); return hangUp(); }
      setP("speaking");
      speaker.current!.enqueue("Sorry, the line broke up for a second. Could you say that again?");
      thenListen(myTurn);
    }
  }, [hangUp]);

  // Does this transcript just repeat what the assistant said? (Its voice leaking back into the mic.)
  const isEcho = (t: string) => {
    const w = words(t);
    if (w.length < 3) return false;
    const ai = new Set(linesRef.current.filter((l) => l.speaker === "ai").slice(-2).flatMap((l) => words(l.text)));
    return w.filter((x) => ai.has(x)).length / w.length >= 0.7;
  };

  const heardText = (t: string) => {
    if (mutedRef.current || ended.current) return;
    const ph = phaseRef.current;
    if (ph === "ringing") return;
    if (ph === "speaking" || ph === "thinking") {
      // While the assistant talks or thinks, ignore echo and tiny noises ("yeah", "mm") unless they say stop/wait.
      if (isEcho(t)) return;
      if (words(t).length < 3 && !STOP.test(t)) return;
    }
    if (ph === "speaking") { turnId.current++; speaker.current?.cancel(); }
    if (ph === "thinking") {
      // They kept talking while we were thinking: merge into the previous line and ask again.
      inflight.current?.abort();
      const last = linesRef.current[linesRef.current.length - 1];
      if (last?.speaker === "caller") { t = `${last.text} ${t}`; linesRef.current = linesRef.current.slice(0, -1); }
    }
    const prev = linesRef.current[linesRef.current.length - 1];
    if (prev?.speaker === "caller" && prev.text.trim().toLowerCase() === t.trim().toLowerCase()) return; // duplicate transcript
    add("caller", t);
    respond();
  };

  async function start() {
    if (starting.current) return; // a double tap would otherwise open two calls that talk over each other
    starting.current = true;
    setErr("");
    if (!(await serverSttAvailable()) || !(await serverVoiceAvailable())) {
      starting.current = false;
      return setErr("The voice service isn't configured on this server yet.");
    }
    speaker.current = createSpeaker({ server: true, rate: 1.05, onError: setErr });
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      starting.current = false;
      return setErr("Microphone access is needed for a call. Allow it in your browser's address bar and try again.");
    }
    ended.current = false;
    linesRef.current = [];
    setLines([]);
    setElapsed(0);
    setP("ringing");
    vad.current = createVadListener({
      stream: stream.current, pauseMs: 700,
      // With headphones there is no echo, so cut the assistant off the instant they speak; otherwise wait for the transcript.
      onSpeechStart: () => { if (phaseRef.current === "speaking" && hpRef.current && !mutedRef.current) speakInterrupt(); },
      onSegmentEnd: () => { if (phaseRef.current === "listening") speaker.current?.playFiller(); },
      onFinal: heardText,
      onError: setErr,
    });
    // Mic level for the visual.
    const an = vad.current && new AudioContext();
    if (an) {
      const node = an.createAnalyser(); node.fftSize = 512;
      an.createMediaStreamSource(stream.current).connect(node);
      const buf = new Uint8Array(node.fftSize);
      const tick = () => {
        if (ended.current) { an.close().catch(() => {}); return; }
        node.getByteTimeDomainData(buf);
        let p = 0; for (const v of buf) p = Math.max(p, Math.abs(v - 128));
        setLevel(mutedRef.current ? 0 : Math.min(1, p / 70));
        requestAnimationFrame(tick);
      };
      tick();
    }
    speaker.current.loadFillers();
    await ring();
    if (ended.current) return;
    t0.current = Date.now();
    const myTurn = ++turnId.current;
    const greeting = "Hi there, thanks for calling. I'm your AI support assistant for banking, finance and microfinance, and you can ask me about anything else too. How can I help you today?";
    add("ai", greeting);
    setP("speaking");
    speaker.current.enqueue(greeting);
    vad.current.start(); // stays armed so the caller can talk over the greeting
    thenListen(myTurn);
  }

  const toggleMute = () => {
    const m = !mutedRef.current;
    mutedRef.current = m;
    setMuted(m);
    if (m) vad.current?.stop(); else if (phaseRef.current !== "thinking") vad.current?.start();
  };

  useEffect(() => () => { ended.current = true; speaker.current?.cancel(); vad.current?.destroy(); stream.current?.getTracks().forEach((t) => t.stop()); }, []);

  const status =
    phase === "ringing" ? "Calling…" :
    muted ? "You're muted" :
    phase === "speaking" ? "Assistant is speaking" :
    phase === "thinking" ? "One moment…" :
    phase === "listening" ? "Listening…" : "";

  if (phase === "idle" || phase === "ended") {
    return (
      <div className="room mx-auto max-w-md rounded-3xl p-8 text-center text-white sm:p-10">
        <div className="orb mx-auto mb-6 h-24 w-24" data-state="idle" />
        <h1 className="text-2xl font-semibold tracking-tight">{phase === "ended" ? "Call ended" : "Banking & finance support"}</h1>
        <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-slate-300">
          {phase === "ended"
            ? `You were on the line for ${fmt(elapsed)}.`
            : "Ask about banking, loans, savings, microfinance or anything else, as if phoning a person. Speak whenever you like, and you can interrupt at any time."}
        </p>
        {phase === "idle" && (
          <label className="mt-6 block text-left text-xs font-medium text-slate-300">
            Which bank or business is this for? <span className="text-slate-500">(optional)</span>
            <textarea
              value={context} onChange={(e) => setContext(e.target.value.slice(0, 1500))} rows={3}
              placeholder="e.g. You support customers of Sunrise Microfinance Bank: savings, group loans and transfers. Branches open 8–4. (Skip it to ask general questions.)"
              className="mt-1.5 w-full resize-none rounded-xl border border-white/15 bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-indigo-400 focus:outline-none"
            />
          </label>
        )}
        {err && <p className="mt-4 text-sm text-red-300">{err}</p>}
        <button className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-3 font-semibold text-white transition hover:bg-emerald-400 active:scale-[0.99]" onClick={start}>
          <PhoneIcon /> {phase === "ended" ? "Call again" : "Start call"}
        </button>
        <p className="mt-4 text-xs text-slate-400">You&apos;re speaking with an AI. Use headphones for the best experience.</p>
      </div>
    );
  }

  return (
    <div className="room mx-auto flex min-h-[34rem] max-w-md flex-col rounded-3xl p-6 text-white sm:p-8">
      <div className="text-center">
        <p className="text-sm font-medium text-slate-300">AI Assistant</p>
        <p className="mt-0.5 font-mono text-xs text-slate-400">{phase === "ringing" ? "Connecting…" : fmt(elapsed)}</p>
      </div>
      <div className="grid flex-1 place-items-center py-6">
        <div className="text-center">
          <div
            className="orb mx-auto h-36 w-36"
            data-state={phase === "ringing" ? "thinking" : phase}
            style={phase === "listening" && !muted ? { transform: `scale(${1 + level * 0.18})` } : undefined}
          />
          <p className="mt-5 text-sm text-slate-300" aria-live="polite">{status}</p>
          {err && <p className="mx-auto mt-2 max-w-xs text-xs text-red-300">{err}</p>}
        </div>
      </div>
      {showText && (
        <div ref={logRef} className="mb-4 max-h-40 space-y-2 overflow-y-auto rounded-2xl bg-white/5 p-3 text-sm">
          {lines.length === 0 && <p className="text-slate-500">Captions will appear here.</p>}
          {lines.map((l, i) => (
            <p key={i} className={l.speaker === "ai" ? "text-slate-200" : "text-indigo-200"}>
              <span className="mr-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{l.speaker === "ai" ? "Assistant" : "You"}</span>{l.text}
            </p>
          ))}
        </div>
      )}
      <div className="flex items-center justify-center gap-3 sm:gap-5">
        <button onClick={toggleMute} aria-pressed={muted} className={`grid h-14 w-14 place-items-center rounded-full text-sm font-medium transition ${muted ? "bg-white text-slate-900" : "bg-white/10 hover:bg-white/20"}`}>
          {muted ? "Unmute" : "Mute"}
        </button>
        <button onClick={hangUp} aria-label="End call" className="grid h-16 w-16 place-items-center rounded-full bg-red-500 transition hover:bg-red-400 active:scale-95">
          <PhoneIcon down />
        </button>
        <button onClick={() => setHeadphones((h) => !h)} aria-pressed={headphones} title="Turn on if you wear headphones: lets you interrupt instantly" className={`grid h-14 w-14 place-items-center rounded-full text-[11px] font-medium leading-tight transition ${headphones ? "bg-emerald-500" : "bg-white/10 hover:bg-white/20"}`}>
          Head-<br />phones
        </button>
        <button onClick={() => setShowText((s) => !s)} aria-pressed={showText} className={`grid h-14 w-14 place-items-center rounded-full text-sm font-medium transition ${showText ? "bg-white/20" : "bg-white/10 hover:bg-white/20"}`}>
          CC
        </button>
      </div>
    </div>
  );
}

function PhoneIcon({ down }: { down?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={`h-6 w-6 ${down ? "rotate-[135deg]" : ""}`} fill="currentColor" aria-hidden>
      <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.6a1 1 0 0 1-.25 1z" />
    </svg>
  );
}
