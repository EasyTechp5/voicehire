import Link from "next/link";

export function Header({ area }: { area?: "admin" | "candidate" }) {
  return (
    <header className="border-b border-neutral-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent text-white">V</span>
          VoiceHire
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          {area === "admin" && (
            <>
              <Link href="/admin" className="hover:underline">Dashboard</Link>
              <Link href="/admin/jobs/new" className="hover:underline">New job</Link>
            </>
          )}
          <Link href="/admin" className={area === "admin" ? "hidden" : "text-neutral-500 hover:underline"}>
            Admin
          </Link>
          <Link href="/interview" className={area === "candidate" ? "hidden" : "text-neutral-500 hover:underline"}>
            Candidate
          </Link>
        </nav>
      </div>
    </header>
  );
}
