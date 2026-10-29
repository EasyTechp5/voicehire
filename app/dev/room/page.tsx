"use client";
// Local-only preview of the interview room states (404 in production).
import { useState } from "react";
import { notFound } from "next/navigation";
import { RoomView, IdleView, type RoomPhase } from "@/components/RoomView";
import { Header } from "@/components/Header";
import type { Turn } from "@/lib/types";

const turns: Turn[] = [
  { speaker: "ai", text: "Hello, I'm your AI interviewer for the Customer Support Agent position. Are you ready to start your interview?", at: 0 },
  { speaker: "candidate", text: "Yes, I'm ready.", at: 4000 },
  { speaker: "ai", text: "Great, let's begin. Tell me about a time you turned around an upset customer.", at: 8000 },
  { speaker: "candidate", text: "A client was double charged. I refunded it on the call and followed up by email the same day.", at: 22000 },
  { speaker: "ai", text: "That's helpful. Can you tell me what you said to calm them down at the start of the call?", at: 30000 },
];

export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  const [phase, setPhase] = useState<RoomPhase | "idle">("listening");
  const [live, setLive] = useState("I started by apologising and");
  return (
    <>
      <Header area="candidate" />
      <main className="mx-auto w-full max-w-5xl px-5 py-8">
        <div className="mb-4 flex gap-2">
          {(["idle", "speaking", "listening", "thinking"] as const).map((p) => (
            <button key={p} className="btn-ghost" onClick={() => { setPhase(p); setLive(p === "listening" ? "I started by apologising and" : ""); }}>{p}</button>
          ))}
        </div>
        {phase === "idle" ? (
          <IdleView title="Customer Support Agent" durationMin={10} err="" onStart={() => setPhase("speaking")} />
        ) : (
          <RoomView
            title="Customer Support Agent" durationMin={10} phase={phase} turns={phase === "thinking" ? turns.slice(0, 4) : turns}
            live={live} level={0.55} elapsed={187} canVoice transcribing={false} heard natural serverStt
            voices={[]} voiceURI="" rate={1.05} headphones err="" onVoice={() => {}} onRate={() => {}} onHeadphones={() => {}}
            onOrb={() => {}} onSend={() => {}} onEnd={() => {}}
          />
        )}
      </main>
    </>
  );
}
