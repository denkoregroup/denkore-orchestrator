import type { Metadata } from "next";

export const metadata: Metadata = { title: "Runs · Denkore" };

export default function RunsPage() {
  return (
    <section className="mx-auto max-w-2xl space-y-2">
      <h1 className="text-xl font-semibold">Runs</h1>
      <p className="text-muted">Active and past runs, with their current state and cost.</p>
      <p className="text-sm text-muted">Placeholder.</p>
    </section>
  );
}
