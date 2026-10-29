"use client";
import { useEffect, useState } from "react";
import { Header } from "./Header";
import { admin } from "@/lib/api";
import { IconLock } from "./icons";

/** Shows a passcode screen until the admin is signed in. */
export function AdminGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"loading" | "out" | "in">("loading");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { admin.me().then(() => setState("in")).catch(() => setState("out")); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try { await admin.login(pass); setState("in"); }
    catch { setErr("That passcode isn't right."); }
    finally { setBusy(false); }
  }

  if (state === "in") return <>{children}</>;
  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-sm flex-1 px-5 py-20">
        {state === "loading" ? null : (
          <form onSubmit={submit} className="card space-y-4">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-indigo-50 text-indigo-600"><IconLock /></div>
            <div>
              <h1 className="text-xl font-semibold">Admin sign in</h1>
              <p className="mt-1 text-sm text-slate-500">Enter the admin passcode to view jobs, transcripts and scores.</p>
            </div>
            <input className="input" type="password" autoFocus placeholder="Passcode" value={pass} onChange={(e) => setPass(e.target.value)} />
            {err && <p className="text-sm text-red-600">{err}</p>}
            <button className="btn-primary w-full" disabled={busy || !pass}>{busy ? "Checking…" : "Sign in"}</button>
          </form>
        )}
      </main>
    </>
  );
}
