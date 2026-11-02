import { Header } from "@/components/Header";
import { CallView } from "@/components/CallView";

export const metadata = { title: "Call the assistant · VoiceHire" };

export default function CallPage() {
  return (
    <>
      <Header area="candidate" />
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-8">
        <CallView />
      </main>
    </>
  );
}
