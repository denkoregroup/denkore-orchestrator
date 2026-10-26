import type { Metadata } from "next";

export const metadata: Metadata = { title: "Audit · Denkore" };

export default function AuditPage() {
  return (
    <section className="mx-auto max-w-2xl space-y-2">
      <h1 className="text-xl font-semibold">Audit</h1>
      <p className="text-muted">The append-only event log for every run, step, gate, and approval.</p>
      <p className="text-sm text-muted">Placeholder.</p>
    </section>
  );
}
