// Speech engine: streaming-friendly TTS (natural server voice if configured, else best browser voice)
// and continuous STT via the browser's Web Speech API.
/* eslint-disable @typescript-eslint/no-explicit-any */

export const sttSupported = () =>
  typeof window !== "undefined" &&
  !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

// ---------- Voices ----------
const GOOD = /natural|neural|premium|enhanced|online|google (us|uk) english|samantha|ava|allison|serena|zoe|aria|jenny|sonia|libby/i;

export function englishVoices(): SpeechSynthesisVoice[] {
  return speechSynthesis
    .getVoices()
    .filter((v) => v.lang.toLowerCase().startsWith("en"))
    .sort((a, b) => Number(GOOD.test(b.name)) - Number(GOOD.test(a.name)));
}

export function bestVoice(uri?: string): SpeechSynthesisVoice | undefined {
  const vs = englishVoices();
  return vs.find((v) => v.voiceURI === uri) || vs[0];
}

export function onVoicesReady(cb: () => void) {
  cb();
  speechSynthesis.addEventListener?.("voiceschanged", cb);
  return () => speechSynthesis.removeEventListener?.("voiceschanged", cb);
}

// ---------- Speaker ----------
export type Speaker = {
  enqueue: (text: string) => void;
  cancel: () => void;
  idle: () => Promise<void>;
  setRate: (r: number) => void;
  setVoice: (uri: string) => void;
  playFiller: () => void;
  loadFillers: () => Promise<void>;
  readonly natural: boolean;
};

const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

export async function serverVoiceAvailable(): Promise<boolean> {
  try {
    const r = await fetch("/api/tts");
    return (await r.json()).available === true;
  } catch {
    return false;
  }
}

export function createSpeaker(opts: { server: boolean; rate: number; voiceURI?: string; onError?: (m: string) => void }): Speaker {
  let rate = opts.rate;
  let voiceURI = opts.voiceURI;
  let useServer = opts.server;
  let gen = 0;
  let pending = 0;
  let waiters: (() => void)[] = [];
  let chain: Promise<void> = Promise.resolve();
  const el = typeof Audio !== "undefined" ? new Audio() : null;
  const fillerEl = typeof Audio !== "undefined" ? new Audio() : null;
  const fillers: string[] = [];
  let fillerP: Promise<void> = Promise.resolve();
  let fi = 0;
  if (el && useServer) { el.src = SILENT_WAV; el.play().catch(() => {}); } // unlock autoplay on user gesture

  // Only items from the current generation count, so a cancelled item finishing late can't corrupt the counter.
  const done = (g: number = gen) => {
    if (g !== gen) return;
    pending = Math.max(0, pending - 1);
    if (pending === 0) { waiters.forEach((w) => w()); waiters = []; }
  };

  const browserSpeak = (text: string, myGen: number) =>
    new Promise<void>((res) => {
      if (myGen !== gen) return res();
      const u = new SpeechSynthesisUtterance(text);
      const v = bestVoice(voiceURI);
      if (v) { u.voice = v; u.lang = v.lang; }
      u.rate = rate;
      u.pitch = 1;
      const keep = setInterval(() => {
        if (!speechSynthesis.speaking) clearInterval(keep);
        else { speechSynthesis.pause(); speechSynthesis.resume(); }
      }, 10000);
      const fin = () => { clearInterval(keep); res(); };
      u.onend = fin;
      u.onerror = fin;
      speechSynthesis.speak(u);
    });

  // ---- Streaming playback: PCM is fetched as a stream and scheduled on a Web Audio clock as it arrives. ----
  const RATE = 24000;
  let ac: AudioContext | null = null;
  let cursor = 0; // audio-clock time at which the next chunk should start
  let live: AudioBufferSourceNode[] = [];
  const audioCtx = () => {
    if (!ac) { try { ac = new AudioContext({ sampleRate: RATE }); } catch { ac = new AudioContext(); } }
    if (ac.state === "suspended") ac.resume().catch(() => {});
    return ac;
  };
  if (useServer) audioCtx(); // created inside the click handler so playback is allowed

  type Stream = { chunks: Float32Array[]; ended: boolean; failed: boolean; wake?: () => void };
  const startStream = (text: string): Stream => {
    const st: Stream = { chunks: [], ended: false, failed: false };
    const ping = () => { const w = st.wake; st.wake = undefined; w?.(); };
    (async () => {
      for (let attempt = 0; attempt < 2 && !st.chunks.length; attempt++) {
        const ac2 = new AbortController();
        const first = setTimeout(() => ac2.abort(), 9000);
        try {
          const r = await fetch("/api/tts", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ text, format: "pcm" }),
            signal: ac2.signal,
          });
          if (r.status === 429) {
            opts.onError?.("Voice service is rate-limited (429): using the browser voice for now.");
            break;
          }
          if (!r.ok || !r.body) continue;
          const reader = r.body.getReader();
          let odd: number | null = null;
          for (;;) {
            // Abort if the stream stalls mid-sentence.
            const idle = setTimeout(() => ac2.abort(), 6000);
            const { done, value } = await reader.read();
            clearTimeout(idle);
            clearTimeout(first);
            if (done) break;
            let bytes = value;
            if (odd !== null) { const m = new Uint8Array(bytes.length + 1); m[0] = odd; m.set(bytes, 1); bytes = m; odd = null; }
            if (bytes.length % 2) { odd = bytes[bytes.length - 1]; bytes = bytes.subarray(0, bytes.length - 1); }
            const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.length);
            const f = new Float32Array(bytes.length / 2);
            for (let i = 0; i < f.length; i++) f[i] = dv.getInt16(i * 2, true) / 32768;
            if (f.length) { st.chunks.push(f); ping(); }
          }
          fails = 0;
          break;
        } catch { /* timeout or network: retry once if nothing was received */ }
        finally { clearTimeout(first); }
      }
      if (!st.chunks.length) { st.failed = true; if (++fails >= 3) opts.onError?.("The natural voice is having trouble, so the browser voice is being used."); }
      st.ended = true;
      ping();
    })();
    return st;
  };

  // Schedule a stream's audio back to back with whatever is already queued; resolves once it is all scheduled.
  const scheduleStream = async (st: Stream, myGen: number): Promise<boolean> => {
    const ctx = audioCtx();
    let buffered = 0;
    let started = false;
    for (;;) {
      if (myGen !== gen) return true;
      if (!st.chunks.length) {
        if (st.ended) break;
        await new Promise<void>((res) => { st.wake = res; setTimeout(res, 500); });
        continue;
      }
      // Hold back ~120 ms before the first sound so network jitter doesn't cause a stutter.
      if (!started) {
        buffered = st.chunks.reduce((n, c) => n + c.length, 0);
        if (buffered < RATE * 0.12 && !st.ended) { await new Promise<void>((res) => { st.wake = res; setTimeout(res, 150); }); continue; }
        started = true;
      }
      const c = st.chunks.shift()!;
      const buf = ctx.createBuffer(1, c.length, RATE);
      buf.copyToChannel(c as Float32Array<ArrayBuffer>, 0);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = rate;
      src.connect(ctx.destination);
      const at = Math.max(cursor, ctx.currentTime + 0.03);
      src.start(at);
      cursor = at + c.length / RATE / rate;
      live.push(src);
      src.onended = () => { live = live.filter((s) => s !== src); };
    }
    return started;
  };

  const drain = (myGen: number) =>
    new Promise<void>((res) => {
      const t0 = Date.now();
      const iv = setInterval(() => {
        if (myGen !== gen || !ac || ac.currentTime >= cursor - 0.01 || Date.now() - t0 > 30000) { clearInterval(iv); res(); }
      }, 40);
    });

  let fails = 0;
  const fetchAudio = async (text: string): Promise<string | null> => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 9000);
      try {
        const r = await fetch("/api/tts", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text, format: "mp3" }),
          signal: ac.signal,
        });
        if (r.ok) {
          const blob = await r.blob();
          clearTimeout(timer);
          fails = 0;
          return URL.createObjectURL(blob);
        }
        if (r.status === 429) {
          clearTimeout(timer);
          opts.onError?.("Voice service is rate-limited (429): using the browser voice for now.");
          return null;
        }
      } catch { /* timeout or network: retry once */ }
      clearTimeout(timer);
    }
    // A single hiccup just uses the browser voice for this sentence; only warn if it keeps failing.
    if (++fails >= 3) opts.onError?.("The natural voice is having trouble, so the browser voice is being used.");
    return null;
  };

  return {
    get natural() { return useServer; },
    async loadFillers() {
      if (!useServer) return;
      for (const t of ["Mm-hm.", "Okay."]) {
        const u = await fetchAudio(t);
        if (u) fillers.push(u);
      }
    },
    playFiller() {
      if (!useServer || !fillerEl || !fillers.length) return;
      fillerEl.src = fillers[fi++ % fillers.length];
      fillerP = new Promise<void>((res) => {
        const guard = setTimeout(res, 2500);
        const fin = () => { clearTimeout(guard); res(); };
        fillerEl.onended = fillerEl.onerror = fin;
        fillerEl.play().catch(fin);
      });
    },
    setRate: (r) => { rate = r; for (const src of live) src.playbackRate.value = r; },
    setVoice: (u) => { voiceURI = u; },
    enqueue(text) {
      const myGen = gen;
      pending++;
      if (useServer && el) {
        const st = startStream(text); // start fetching immediately, play in order
        chain = chain.then(async () => {
          await fillerP; // let a short "Mm-hm" finish before the real reply
          if (myGen !== gen) return done(myGen);
          const ok = await scheduleStream(st, myGen);
          if (myGen !== gen) return done(myGen);
          if (!ok || st.failed) { await drain(myGen); await browserSpeak(text, myGen); return done(myGen); }
          // Next sentence can be scheduled right away (gapless); this one counts as done when it has played.
          drain(myGen).then(() => done(myGen));
        });
      } else {
        chain = chain.then(async () => { await browserSpeak(text, myGen); done(myGen); });
      }
    },
    cancel() {
      gen++;
      speechSynthesis.cancel();
      if (el) { el.onended = null; el.pause(); el.removeAttribute("src"); }
      for (const src of live) { try { src.onended = null; src.stop(); } catch {} }
      live = [];
      cursor = 0;
      if (fillerEl) { fillerEl.onended = null; fillerEl.pause(); }
      fillerP = Promise.resolve();
      chain = Promise.resolve();
      pending = 0;
      waiters.forEach((w) => w());
      waiters = [];
    },
    idle: () => (pending === 0 ? Promise.resolve() : new Promise<void>((r) => waiters.push(r))),
  };
}

// ---------- Listener ----------
export type Listener = { start: () => void; stop: () => void; commit: () => void; setSpeaking?: (b: boolean) => void };

/**
 * Continuous recognition. `onInterim` streams live text; `onFinal` fires once the candidate pauses
 * for `pauseMs` (or when `commit()` is called).
 */
export function createListener(opts: {
  pauseMs: number;
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onStatus?: (s: "listening" | "heard-speech") => void;
  onError?: (e: string) => void;
}): Listener {
  const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  let rec: any = null;
  let running = false;
  let finalText = "";
  let interimText = "";
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = () => {
    clearTimeout(timer);
    const t = (finalText + " " + interimText).trim();
    finalText = "";
    interimText = "";
    if (t) opts.onFinal(t);
  };

  const build = () => {
    rec = new Ctor();
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onaudiostart = () => opts.onStatus?.("listening");
    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += " " + r[0].transcript;
        else interim += r[0].transcript;
      }
      interimText = interim;
      opts.onStatus?.("heard-speech");
      opts.onInterim((finalText + " " + interim).trim());
      clearTimeout(timer);
      timer = setTimeout(flush, opts.pauseMs);
    };
    rec.onerror = (e: any) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        running = false;
        opts.onError?.("Speech recognition is blocked. Allow the microphone in your browser, then refresh.");
      } else if (e.error === "audio-capture") {
        opts.onError?.("No microphone was found.");
      } else if (e.error === "network") {
        opts.onError?.("Speech recognition needs an internet connection.");
      }
    };
    rec.onend = () => {
      if (running) setTimeout(() => { try { rec.start(); } catch { try { build(); rec.start(); } catch {} } }, 120);
    };
  };

  return {
    start() {
      if (running) return;
      finalText = "";
      interimText = "";
      running = true;
      build();
      try { rec.start(); } catch {}
    },
    stop() {
      running = false;
      clearTimeout(timer);
      finalText = "";
      interimText = "";
      try { rec?.abort(); } catch {}
    },
    commit: flush,
  };
}
