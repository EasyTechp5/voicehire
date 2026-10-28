"use client";
import { useEffect, useState, useCallback } from "react";
import { get, set, del } from "idb-keyval";
import type { Interview, Job } from "./types";

const JOBS = "vh.jobs";
const INTERVIEWS = "vh.interviews";

function read<T>(key: string): T[] {
  try {
    return JSON.parse(localStorage.getItem(key) || "[]");
  } catch {
    return [];
  }
}
function write<T>(key: string, v: T[]) {
  localStorage.setItem(key, JSON.stringify(v));
  window.dispatchEvent(new Event("vh-change"));
}

export const uid = () =>
  Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

export const jobsStore = {
  all: () => read<Job>(JOBS),
  get: (id: string) => read<Job>(JOBS).find((j) => j.id === id),
  save: (job: Job) => {
    const all = read<Job>(JOBS).filter((j) => j.id !== job.id);
    write(JOBS, [job, ...all].sort((a, b) => b.createdAt - a.createdAt));
  },
  remove: (id: string) => write(JOBS, read<Job>(JOBS).filter((j) => j.id !== id)),
};

export const interviewsStore = {
  all: () => read<Interview>(INTERVIEWS),
  get: (id: string) => read<Interview>(INTERVIEWS).find((i) => i.id === id),
  save: (iv: Interview) => {
    const all = read<Interview>(INTERVIEWS).filter((i) => i.id !== iv.id);
    write(INTERVIEWS, [iv, ...all].sort((a, b) => b.consentAt - a.consentAt));
  },
  remove: async (id: string) => {
    write(INTERVIEWS, read<Interview>(INTERVIEWS).filter((i) => i.id !== id));
    await del("audio:" + id);
  },
};

export const audioStore = {
  save: (id: string, blob: Blob) => set("audio:" + id, blob),
  get: (id: string) => get<Blob>("audio:" + id),
};

/** Re-renders when the local store changes. Returns null until mounted (SSR-safe). */
export function useStore<T>(select: () => T): T | null {
  const [v, setV] = useState<T | null>(null);
  const refresh = useCallback(() => setV(select()), [select]);
  useEffect(() => {
    refresh();
    window.addEventListener("vh-change", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("vh-change", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [refresh]);
  return v;
}
