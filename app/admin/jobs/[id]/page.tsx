"use client";
import { Suspense, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Header } from "@/components/Header";
import { JobEditor } from "@/components/JobEditor";
import { AdminGate } from "@/components/AdminGate";
import { admin } from "@/lib/api";
import type { Job } from "@/lib/types";

function EditJob() {
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<Job | null | undefined>(undefined);
  useEffect(() => { admin.job(id).then(setJob).catch(() => setJob(null)); }, [id]);
  return (
    <>
      <Header area="admin" />
      <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-8">
        <h1 className="mb-6 text-2xl font-semibold">Edit job</h1>
        {job === undefined ? null : job === null ? <p>Job not found.</p> : <JobEditor initial={job} />}
      </main>
    </>
  );
}

export default function Page() {
  return (
    <Suspense>
      <AdminGate>
        <EditJob />
      </AdminGate>
    </Suspense>
  );
}
