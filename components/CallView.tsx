"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { createSpeaker, serverVoiceAvailable, type Speaker } from "@/lib/speech";
import { createVadListener, serverSttAvailable, type VadListener } from "@/lib/vad";
import { CallPanel, type CallLine, type CallPhase } from "./CallPanel";

type Phase = CallPhase;
type Line = CallLine;

const words = (t: string) => t.toLowerCase().replace(/[^a-z0-9' ]/g, " ").split(/\s+/).filter(Boolean);
const STOP = /\b(stop|wait|hold on|hang on|sorry|actually|no|pause)\b/i;

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

export function CallView({ onClose }: { onClose?: () => void }) {
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
  ctxRef.current = context;

  const setP = (p: Phase) => { phaseRef.current = p; setPhase(p); vad.current?.setSpeaking(p === "speaking"); };
  const sync = () => setLines([...linesRef.current]);
  const add = (speakerName: Line["speaker"], text: string) => { linesRef.current = [...linesRef.current, { speaker: speakerName, text }]; sync(); };
  const patchAi = (text: string) => { const l = linesRef.current[linesRef.current.length - 1]; if (l?.speaker === "ai") { l.text = text; sync(); } };

  useEffect(() => {
    const id = setInterval(() => { if (t0.current && !ended.current) setElapsed(Math.round((Date.now() - t0.current) / 1000)); }, 1000);
    return () => clearInterval(id);
  }, []);

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

  return (
    <CallPanel
      phase={phase} lines={lines} context={context} muted={muted} headphones={headphones} showText={showText}
      elapsed={elapsed} level={level} err={err}
      onContext={(v) => setContext(v.slice(0, 1500))} onStart={start} onHangUp={hangUp} onMute={toggleMute}
      onHeadphones={() => setHeadphones((h) => !h)} onToggleText={() => setShowText((x) => !x)} onClose={onClose}
    />
  );
}
