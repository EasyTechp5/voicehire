// Voice-activity detector + recorder. Captures speech segments from the mic stream,
// ends a segment after a pause, and sends it to /api/stt for transcription.
import type { Listener } from "./speech";

export async function serverSttAvailable(): Promise<boolean> {
  try {
    return (await (await fetch("/api/stt")).json()).available === true;
  } catch {
    return false;
  }
}

function toWav16k(frames: Float32Array[], inRate: number): Blob {
  let len = 0;
  for (const f of frames) len += f.length;
  const ratio = inRate / 16000;
  const outLen = Math.floor(len / ratio);
  const flat = new Float32Array(len);
  let o = 0;
  for (const f of frames) { flat.set(f, o); o += f.length; }
  const pcm = new Int16Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const a = Math.floor(i * ratio), b = Math.min(len, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = a; j < b; j++) sum += flat[j];
    const v = Math.max(-1, Math.min(1, sum / Math.max(1, b - a)));
    pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  const h = new DataView(new ArrayBuffer(44));
  const w = (off: number, s: string) => [...s].forEach((c, i) => h.setUint8(off + i, c.charCodeAt(0)));
  w(0, "RIFF"); h.setUint32(4, 36 + pcm.length * 2, true); w(8, "WAVE"); w(12, "fmt ");
  h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, 1, true);
  h.setUint32(24, 16000, true); h.setUint32(28, 32000, true); h.setUint16(32, 2, true); h.setUint16(34, 16, true);
  w(36, "data"); h.setUint32(40, pcm.length * 2, true);
  return new Blob([h, pcm], { type: "audio/wav" });
}

export type VadListener = Listener & {
  destroy: () => void;
  setSpeaking: (b: boolean) => void;
  /** ms since the last audio frame was processed (a large value means the mic pipeline stalled). */
  sinceFrame: () => number;
  revive: () => void;
};

export function createVadListener(opts: {
  stream: MediaStream;
  pauseMs: number;
  onSpeechStart: () => void;
  onSegmentEnd?: () => void;
  onFinal: (text: string) => void;
  onTranscribing?: (busy: boolean) => void;
  onError?: (e: string) => void;
}): VadListener {
  const ctx = new AudioContext();
  const src = ctx.createMediaStreamSource(opts.stream);
  const proc = ctx.createScriptProcessor(2048, 1, 1);
  const mute = ctx.createGain();
  mute.gain.value = 0;
  src.connect(proc);
  proc.connect(mute);
  mute.connect(ctx.destination);
  const frameMs = (2048 / ctx.sampleRate) * 1000;
  ctx.onstatechange = () => { if (ctx.state === "suspended") ctx.resume().catch(() => {}); };

  let active = false;
  let speaking = false; // AI audio is playing: be stricter so we don't hear ourselves
  let floor = 0.006; // noise floor (lower envelope of the signal)
  let calib = 0, calibN = 0;
  let inSpeech = false, voiced = 0, hot = 0, silentMs = 0, segMs = 0;
  let seg: Float32Array[] = [];
  const pre: Float32Array[] = [];
  let epoch = 0;
  let lastFrame = Date.now();

  const reset = () => { inSpeech = false; voiced = 0; hot = 0; silentMs = 0; segMs = 0; seg = []; };

  async function transcribe(wav: Blob): Promise<string> {
    const r = await fetch("/api/stt", { method: "POST", body: wav });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(r.status === 429 ? "Transcription is rate-limited (429). Please wait a few seconds." : j.error || "Transcription failed");
    return j.text || "";
  }

  async function send(frames: Float32Array[], myEpoch: number) {
    opts.onTranscribing?.(true);
    try {
      const wav = toWav16k(frames, ctx.sampleRate);
      let text: string;
      try { text = await transcribe(wav); }
      catch (e) { await new Promise((r) => setTimeout(r, 700)); text = await transcribe(wav).catch(() => { throw e; }); } // one retry
      if (myEpoch === epoch && text) opts.onFinal(text);
    } catch (e) {
      opts.onError?.((e as Error).message || "Couldn't transcribe that. Please try again.");
    } finally {
      opts.onTranscribing?.(false);
    }
  }

  const endSegment = () => {
    const frames = seg;
    const enough = voiced * frameMs >= 300;
    reset();
    if (enough) { opts.onSegmentEnd?.(); send(frames, epoch); }
  };

  proc.onaudioprocess = (e) => {
    lastFrame = Date.now();
    const data = e.inputBuffer.getChannelData(0);
    const copy = new Float32Array(data);
    let s = 0;
    for (let i = 0; i < copy.length; i++) s += copy[i] * copy[i];
    const rms = Math.sqrt(s / copy.length);

    if (calibN < 14) { calib += rms; calibN++; if (calibN === 14) floor = Math.max(0.004, Math.min(0.02, calib / calibN)); return; }
    // Track the lower envelope: drop fast to quieter frames, creep up slowly, never ratchet up on speech.
    if (!speaking) {
      if (rms < floor) floor = floor * 0.6 + rms * 0.4;
      else if (!inSpeech && rms < floor * 1.6) floor += (rms - floor) * 0.01;
      floor = Math.max(0.003, Math.min(0.02, floor));
    }
    const thr = Math.max(0.012, floor * 2.8) * (speaking ? 2.4 : 1);

    if (!active) { reset(); return; }
    const loud = rms > thr;

    if (!inSpeech) {
      pre.push(copy);
      if (pre.length > 9) pre.shift();
      hot = loud ? hot + 1 : 0;
      if (hot >= (speaking ? 8 : 3)) { // ~130ms (or ~350ms over the AI) of sustained sound
        inSpeech = true;
        seg = [...pre];
        pre.length = 0;
        voiced = hot;
        silentMs = 0;
        opts.onSpeechStart();
      }
      return;
    }
    seg.push(copy);
    segMs += frameMs;
    if (loud) { voiced++; silentMs = 0; } else if (rms < thr * 0.75) silentMs += frameMs;
    if (silentMs >= opts.pauseMs || segMs > 45000) endSegment();
  };

  return {
    start() { if (ctx.state === "suspended") ctx.resume().catch(() => {}); if (active) return; reset(); pre.length = 0; active = true; },
    stop() { active = false; epoch++; reset(); },
    setSpeaking(b) { speaking = b; },
    commit() { if (inSpeech) endSegment(); },
    sinceFrame: () => Date.now() - lastFrame,
    revive() { ctx.resume().catch(() => {}); },
    destroy() { active = false; epoch++; try { proc.disconnect(); src.disconnect(); ctx.close(); } catch {} },
  };
}
