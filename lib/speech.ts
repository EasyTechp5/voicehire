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

export function createSpeaker(opts: { server: boolean; rate: number; voiceURI?: string }): Speaker {
  let rate = opts.rate;
  let voiceURI = opts.voiceURI;
  let useServer = opts.server;
  let gen = 0;
  let pending = 0;
  let waiters: (() => void)[] = [];
  let chain: Promise<void> = Promise.resolve();
  const el = typeof Audio !== "undefined" ? new Audio() : null;
  if (el && useServer) { el.src = SILENT_WAV; el.play().catch(() => {}); } // unlock autoplay on user gesture

  const done = () => {
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

  const fetchAudio = async (text: string): Promise<string | null> => {
    try {
      const r = await fetch("/api/tts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!r.ok) throw new Error("tts");
      return URL.createObjectURL(await r.blob());
    } catch {
      return null;
    }
  };

  return {
    get natural() { return useServer; },
    setRate: (r) => { rate = r; if (el) el.playbackRate = r; },
    setVoice: (u) => { voiceURI = u; },
    enqueue(text) {
      const myGen = gen;
      pending++;
      if (useServer && el) {
        const urlP = fetchAudio(text); // start fetching immediately, play in order
        chain = chain.then(async () => {
          const url = await urlP;
          if (myGen !== gen) { if (url) URL.revokeObjectURL(url); return done(); }
          if (!url) { useServer = false; await browserSpeak(text, myGen); return done(); }
          await new Promise<void>((res) => {
            el.src = url;
            el.playbackRate = rate;
            el.onended = el.onerror = () => res();
            el.play().catch(() => res());
          });
          URL.revokeObjectURL(url);
          done();
        });
      } else {
        chain = chain.then(async () => { await browserSpeak(text, myGen); done(); });
      }
    },
    cancel() {
      gen++;
      speechSynthesis.cancel();
      if (el) { el.onended = null; el.pause(); el.removeAttribute("src"); }
      chain = Promise.resolve();
      pending = 0;
      waiters.forEach((w) => w());
      waiters = [];
    },
    idle: () => (pending === 0 ? Promise.resolve() : new Promise<void>((r) => waiters.push(r))),
  };
}

// ---------- Listener ----------
export type Listener = { start: () => void; stop: () => void; commit: () => void };

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
