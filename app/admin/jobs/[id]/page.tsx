"use client";
import { Suspense } from "react";
import { useParams } from "next/navigation";
import { Header } from "@/components/Header";
import { JobEditor } from "@/components/JobEditor";
import { jobsStore } from "@/lib/store";
import { useEffect, useState } from "react";
import type { Job } from "@/lib/types";

function EditJob() {
  const { id } = useParams<{ id: string }>();
  const [job, setJob] = useState<Job | null | undefined>(undefined);
  useEffect(() => setJob(jobsStore.get(id) ?? null), [id]);
  return (
    <>
      <Header area="admin" />
      <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-8">
        <h1 className="mb-6 text-2xl font-semibold">Edit job</h1>
        {job === undefined ? null : job === null ? <p>Job not found on this device.</p> : <JobEditor initial={job} />}
      </main>
    </>
  );
}

export default function Page() {
  return (
    <Suspense>
      <EditJob />
    </Suspense>
  );
}
