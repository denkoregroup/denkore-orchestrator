import type { Metadata } from "next";

export const metadata: Metadata = { title: "Prompt · Denkore" };

export default function PromptPage() {
  return (
    <section className="mx-auto max-w-2xl space-y-2">
      <h1 className="text-xl font-semibold">Prompt</h1>
      <p className="text-muted">Describe what you want built. Submitting a prompt will create a queued run.</p>
      <p className="text-sm text-muted">Placeholder.</p>
    </section>
  );
}
