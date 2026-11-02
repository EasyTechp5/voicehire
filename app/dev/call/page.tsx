"use client";
// Local-only preview of the call panel states (404 in production).
import { useState } from "react";
import { notFound } from "next/navigation";
import { CallPanel, type CallPhase } from "@/components/CallPanel";

const lines = [
  { speaker: "ai" as const, text: "Hi there, thanks for calling. I'm your AI support assistant for banking, finance and microfinance. How can I help you today?" },
  { speaker: "caller" as const, text: "How does a group loan work, and what happens if someone defaults?" },
  { speaker: "ai" as const, text: "A small group borrows together and each member takes their own portion. If one member defaults, the others are often expected to help cover it." },
];

export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  const [phase, setPhase] = useState<CallPhase>("listening");
  const [muted, setMuted] = useState(false);
  const [hp, setHp] = useState(false);
  const [cc, setCc] = useState(true);
  const [ctx, setCtx] = useState("");
  return (
    <main className="mx-auto max-w-md px-4 py-8">
      <div className="mb-4 flex flex-wrap gap-2">
        {(["idle", "ringing", "speaking", "listening", "thinking", "ended"] as const).map((p) => (
          <button key={p} className="btn-ghost" onClick={() => setPhase(p)}>{p}</button>
        ))}
      </div>
      <CallPanel
        phase={phase} lines={phase === "ringing" ? [] : lines} context={ctx} muted={muted} headphones={hp} showText={cc}
        elapsed={74} level={0.5} err="" onContext={setCtx} onStart={() => setPhase("ringing")} onHangUp={() => setPhase("ended")}
        onMute={() => setMuted((m) => !m)} onHeadphones={() => setHp((h) => !h)} onToggleText={() => setCc((c) => !c)} onClose={() => {}}
      />
    </main>
  );
}
