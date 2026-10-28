"use client";
import { useState } from "react";

/** Paste text, or upload a PDF / text file. PDFs are transcribed server-side. */
export function TextOrFile({
  kind,
  value,
  onChange,
  rows = 8,
  placeholder,
}: {
  kind: "jd" | "resume";
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function onFile(f: File) {
    setErr("");
    if (f.size > 3_000_000) return setErr("File is too large (max 3 MB).");
    setBusy(true);
    try {
      if (f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf")) {
        const buf = new Uint8Array(await f.arrayBuffer());
        let bin = "";
        for (let i = 0; i < buf.length; i += 0x8000)
          bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        const r = await fetch("/api/extract", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ pdfBase64: btoa(bin), kind }),
        });
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Could not read PDF");
        onChange(j.text);
      } else {
        onChange(await f.text());
      }
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <textarea
        className="input font-mono"
        rows={rows}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      <div className="mt-2 flex items-center gap-3 text-sm">
        <label className="btn-ghost cursor-pointer">
          {busy ? "Reading file…" : "Upload PDF or .txt"}
          <input
            type="file"
            accept=".pdf,.txt,.md,application/pdf,text/plain"
            className="hidden"
            disabled={busy}
            onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])}
          />
        </label>
        {err && <span className="text-red-600">{err}</span>}
      </div>
    </div>
  );
}
