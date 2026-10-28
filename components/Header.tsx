import Link from "next/link";

export function Header({ area }: { area?: "admin" | "candidate" }) {
  const pill = (active: boolean) =>
    `rounded-full px-3 py-1.5 text-sm transition ${active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`;
  return (
    <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
        <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight">
          <span className="grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-500 text-white shadow-sm">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 3v18M7 8v8M17 8v8M2 11v2M22 11v2" /></svg>
          </span>
          VoiceHire
        </Link>
        <nav className="flex items-center gap-1">
          {area === "admin" && <Link href="/admin/jobs/new" className="mr-2 text-sm font-medium text-indigo-600 hover:underline">+ New job</Link>}
          <Link href="/admin" className={pill(area === "admin")}>Admin</Link>
          <Link href="/interview" className={pill(area === "candidate")}>Candidate</Link>
        </nav>
      </div>
    </header>
  );
}
