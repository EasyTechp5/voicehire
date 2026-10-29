"use client";
import { Header } from "@/components/Header";
import { JobEditor } from "@/components/JobEditor";
import { AdminGate } from "@/components/AdminGate";

export default function NewJob() {
  return (
    <AdminGate>
      <Header area="admin" />
      <main className="mx-auto w-full max-w-4xl flex-1 px-5 py-8">
        <h1 className="mb-6 text-2xl font-semibold">New job</h1>
        <JobEditor />
      </main>
    </AdminGate>
  );
}
