import type { Metadata } from "next";
import { ApprovalsBoard } from "@/components/approvals/approvals-board";
import { GateCard } from "@/components/gate-card";
import { toGateReview } from "@/lib/approvals/map";
import { listPendingGates } from "@/lib/data/gates";
import { getRegistry } from "@/lib/registry/cached";
import { decideGateAction } from "./actions";

export const metadata: Metadata = { title: "Approvals · Denkore" };

export default async function ApprovalsPage() {
  const [pending, registry] = await Promise.all([listPendingGates(), getRegistry()]);
  const gates = pending.map((p) =>
    toGateReview(p, p.project ? registry.get(p.project.registry_id) : undefined),
  );

  return (
    <section className="mx-auto max-w-2xl space-y-2">
      <h1 className="text-xl font-semibold">Approvals</h1>
      <ApprovalsBoard action={decideGateAction}>
        {gates.length === 0 ? (
          <p className="rounded-lg border border-border p-4 text-muted">Nothing needs your OK right now.</p>
        ) : (
          <div className="space-y-6">
            {gates.map((gate) => (
              <GateCard key={`${gate.gateId}:${gate.technical.commitSha}`} gate={gate} />
            ))}
          </div>
        )}
      </ApprovalsBoard>
    </section>
  );
}
