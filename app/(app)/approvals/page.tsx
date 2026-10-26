import type { Metadata } from "next";
import { GateCard } from "@/components/gate-card";
import { SAMPLE_GATE } from "@/lib/approvals/sample";

export const metadata: Metadata = { title: "Approvals · Denkore" };

export default function ApprovalsPage() {
  return (
    <section className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">Approvals</h1>
      <p className="text-sm text-muted">Sample gate. Live gates will load from Supabase.</p>
      <GateCard gate={SAMPLE_GATE} />
    </section>
  );
}
