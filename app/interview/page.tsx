import { Suspense } from "react";
import { Header } from "@/components/Header";
import { InterviewFlow } from "@/components/InterviewFlow";

export default function InterviewPage() {
  return (
    <>
      <Header area="candidate" />
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8">
        <Suspense>
          <InterviewFlow />
        </Suspense>
      </main>
    </>
  );
}
