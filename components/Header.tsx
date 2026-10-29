"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "./Logo";
import { IconLogout } from "./icons";
import { admin } from "@/lib/api";

export function Header({ area }: { area?: "admin" | "candidate" }) {
  const [authed, setAuthed] = useState(false);
  useEffect(() => {
    if (area === "admin") admin.me().then(() => setAuthed(true)).catch(() => setAuthed(false));
  }, [area]);

  const pill = (active: boolean) =>
    `rounded-full px-3.5 py-1.5 text-sm font-medium transition ${active ? "bg-slate-900 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"}`;

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/70 bg-white/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
        <Link href="/" className="flex items-center gap-2.5 text-[17px] font-semibold tracking-tight">
          <Logo size={32} />
          VoiceHire
        </Link>
        <nav className="flex items-center gap-1">
          {area === "admin" && authed && (
            <>
              <Link href="/admin/jobs/new" className="btn-primary mr-1 hidden px-3.5 py-1.5 sm:inline-flex">+ New job</Link>
              <button
                className="mr-1 rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
                title="Sign out"
                aria-label="Sign out"
                onClick={async () => { await admin.logout(); location.href = "/admin"; }}
              >
                <IconLogout className="h-[18px] w-[18px]" />
              </button>
            </>
          )}
          <Link href="/admin" className={pill(area === "admin")}>Admin</Link>
          <Link href="/interview" className={pill(area === "candidate")}>Candidate</Link>
        </nav>
      </div>
    </header>
  );
}
