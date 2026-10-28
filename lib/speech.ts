// Thin wrappers over the browser's Web Speech API (STT + TTS).
/* eslint-disable @typescript-eslint/no-explicit-any */

export const sttSupported = () =>
  typeof window !== "undefined" &&
  !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

export function pickVoice(): SpeechSynthesisVoice | undefined {
  const vs = speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en"));
  return (
    vs.find((v) => /natural|neural|premium|enhanced|google uk english female|samantha|ava|serena/i.test(v.name)) ||
    vs.find((v) => v.lang === "en-GB" || v.lang === "en-US") ||
    vs[0]
  );
}

export function speak(text: string, rate = 1): { done: Promise<void>; cancel: () => void } {
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.voice = pickVoice() ?? null;
  u.rate = rate;
  u.lang = u.voice?.lang || "en-US";
  const done = new Promise<void>((res) => {
    u.onend = () => res();
    u.onerror = () => res();
  });
  // Chrome sometimes stalls long utterances; a periodic resume keeps it alive.
  const keep = setInterval(() => {
    if (!speechSynthesis.speaking) clearInterval(keep);
    else { speechSynthesis.pause(); speechSynthesis.resume(); }
  }, 10000);
  speechSynthesis.speak(u);
  return { done: done.finally(() => clearInterval(keep)), cancel: () => speechSynthesis.cancel() };
}

export type Listener = {
  start: () => void;
  stop: () => void;
};

/**
 * Continuous recognition. `onInterim` fires with live text (used for barge-in and captions);
 * `onFinal` fires once the candidate has paused for `pauseMs` after their last words.
 */
export function createListener(opts: {
  pauseMs: number;
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onError?: (e: string) => void;
}): Listener {
  const Ctor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  let rec: any = null;
  let running = false;
  let finalText = "";
  let timer: ReturnType<typeof setTimeout> | undefined;

  const flush = () => {
    const t = finalText.trim();
    finalText = "";
    if (t) opts.onFinal(t);
  };

  const build = () => {
    rec = new Ctor();
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += " " + r[0].transcript;
        else interim += r[0].transcript;
      }
      opts.onInterim((finalText + " " + interim).trim());
      clearTimeout(timer);
      timer = setTimeout(flush, opts.pauseMs);
    };
    rec.onerror = (e: any) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        running = false;
        opts.onError?.("Microphone or speech recognition was blocked.");
      }
    };
    rec.onend = () => {
      // Browsers end recognition on their own after silence; restart while we should be listening.
      if (running) { try { rec.start(); } catch {} }
    };
  };

  return {
    start() {
      if (running) return;
      finalText = "";
      running = true;
      build();
      try { rec.start(); } catch {}
    },
    stop() {
      running = false;
      clearTimeout(timer);
      finalText = "";
      try { rec?.abort(); } catch {}
    },
  };
}
