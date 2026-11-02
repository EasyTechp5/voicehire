"use client";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { CallView } from "./CallView";

// Floating call button (bottom right) that opens the voice call in a popup on any page.
export function FloatingCall() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  // Hidden where the microphone is already in use (interview, call page) and in the admin area.
  if (path.startsWith("/interview") || path.startsWith("/call") || path.startsWith("/dev") || path.startsWith("/admin")) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-3 sm:bottom-6 sm:right-6">
      {open && (
        <div className="max-h-[85vh] w-[min(25rem,calc(100vw-2rem))] overflow-y-auto rounded-3xl shadow-2xl shadow-black/40">
          {/* Unmounting hangs up the call and releases the microphone. */}
          <CallView onClose={() => setOpen(false)} />
        </div>
      )}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close call" : "Call our assistant"}
        title={open ? "Close" : "Talk to our assistant"}
        className={`relative grid h-14 w-14 place-items-center rounded-full text-white shadow-lg shadow-black/25 transition active:scale-95 ${open ? "bg-slate-700 hover:bg-slate-600" : "bg-emerald-500 hover:bg-emerald-400"}`}
      >
        {!open && <span className="absolute inset-0 animate-ping rounded-full bg-emerald-400/40 [animation-duration:2.5s]" aria-hidden />}
        {open ? (
          <svg viewBox="0 0 24 24" className="relative h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6L6 18" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" className="relative h-6 w-6" fill="currentColor" aria-hidden>
            <path d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.6a1 1 0 0 1-.25 1z" />
          </svg>
        )}
      </button>
    </div>
  );
}
