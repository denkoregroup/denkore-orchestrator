import type { z } from "zod";
import type { PendingGate } from "@/lib/data/gates";
import type { StepRow } from "@/lib/data/rows";
import { totalCost } from "@/lib/data/totals";
import type { RegistryEntry } from "@/lib/registry/schema";
import type { GateKind } from "@/lib/state-machine";
import { approvalModeFor } from "./mode";
import { gateReviewSchema, gateTechnicalSchema } from "./schema";
import type { GateReview } from "./types";

/** The step whose success opens each gate (see lib/state-machine/machine.ts). */
const STEP_FOR_GATE: Record<GateKind, StepRow["step"]> = {
  spec: "spec",
  design: "design",
  release: "verify",
};

/**
 * The step that produced the gate: the newest succeeded step at the gate's
 * commit, else the newest succeeded step of the kind that opens this gate.
 */
export function stepForGate(gate: { kind: GateKind; commit_sha: string }, steps: StepRow[]): StepRow | null {
  const succeeded = [...steps]
    .filter((s) => s.status === "succeeded")
    .sort((a, b) => b.dispatched_at.localeCompare(a.dispatched_at));
  return (
    succeeded.find((s) => s.commit_sha === gate.commit_sha) ??
    succeeded.find((s) => s.step === STEP_FOR_GATE[gate.kind]) ??
    null
  );
}

function optional<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> | undefined {
  const result = schema.safeParse(value);
  return result.success ? result.data : undefined;
}

export function toGateReview(pending: PendingGate, entry: RegistryEntry | undefined): GateReview {
  const { gate, run, project, steps } = pending;
  const step = stepForGate(gate, steps);
  const output = step?.output ?? {};
  const summary = gateReviewSchema.safeParse(output.gateReview);
  const reported = steps.filter((s) => s.cost_usd !== null);

  return {
    gateId: gate.gate_id,
    runId: run.id,
    project: project?.registry_id ?? "Unknown project",
    kind: gate.kind,
    approval: approvalModeFor(entry, gate.kind),
    summary: summary.success ? summary.data : null,
    technical: {
      // Always the gate's SHA: that is what the approval is checked against.
      commitSha: gate.commit_sha,
      branch: optional(gateTechnicalSchema.branch, output.branch),
      prUrl: step?.pr_url ?? undefined,
      checks: optional(gateTechnicalSchema.checks, output.checks),
      filesChanged: optional(gateTechnicalSchema.filesChanged, output.filesChanged),
      costUsd: reported.length > 0 ? totalCost(reported) : null,
    },
  };
}
