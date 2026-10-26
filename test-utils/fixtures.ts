import type { PendingGate } from "@/lib/data/gates";
import type { StepRow } from "@/lib/data/rows";
import type { GateReview } from "@/lib/approvals/types";

export const IDS = {
  run: "6f1c2b9e-4a3d-4c1e-9b7a-2d5e8f0a1b3c",
  project: "7a2d3c0f-5b4e-4d2f-8c8b-3e6f9a1b2c4d",
  gate: "8b3e4d1a-6c5f-4e3a-9d9c-4f7a0b2c3d5e",
  step: "9c4f5e2b-7d6a-4f4b-8eae-5a8b1c3d4e6f",
};

export const SHA_SHOWN = "1111111111111111111111111111111111111111";
export const SHA_MOVED = "2222222222222222222222222222222222222222";

export const VALID_GATE_REVIEW = {
  headline: "Customers will be able to book a table online.",
  summary: "The booking page is finished and passed its checks.",
  changes: ["A Book a table button on the home page."],
  risks: ["Confirmation emails depend on the email provider."],
};

export function step(overrides: Partial<StepRow> = {}): StepRow {
  return {
    id: IDS.step,
    run_id: IDS.run,
    step: "verify",
    attempt: 1,
    status: "succeeded",
    output: { gateReview: VALID_GATE_REVIEW, filesChanged: 14, branch: "denkore/run-booking" },
    commit_sha: SHA_SHOWN,
    pr_url: "https://github.com/denkoregroup/example-app/pull/42",
    cost_usd: 1.5,
    dispatched_at: "2026-10-26T10:00:00Z",
    completed_at: "2026-10-26T10:05:00Z",
    ...overrides,
  };
}

export function pendingGate(overrides: {
  kind?: PendingGate["gate"]["kind"];
  steps?: StepRow[];
  registryId?: string | null;
} = {}): PendingGate {
  const registryId = overrides.registryId === undefined ? "example-app" : overrides.registryId;
  return {
    gate: {
      gate_id: IDS.gate,
      run_id: IDS.run,
      kind: overrides.kind ?? "release",
      commit_sha: SHA_SHOWN,
      status: "pending",
    },
    run: {
      id: IDS.run,
      project_id: IDS.project,
      state: "release_gate",
      prompt: "Build the booking page",
      test_failures: 0,
      max_test_retries: 3,
      created_at: "2026-10-26T09:00:00Z",
      updated_at: "2026-10-26T10:05:00Z",
    },
    project:
      registryId === null
        ? null
        : { id: IDS.project, registry_id: registryId, repo: "denkoregroup/example-app", created_at: "x" },
    steps: overrides.steps ?? [step()],
  };
}

export function gateReview(overrides: Partial<GateReview> = {}): GateReview {
  return {
    gateId: IDS.gate,
    runId: IDS.run,
    project: "example-app",
    kind: "release",
    approval: "pr_review",
    summary: VALID_GATE_REVIEW,
    technical: {
      commitSha: SHA_SHOWN,
      branch: "denkore/run-booking",
      prUrl: "https://github.com/denkoregroup/example-app/pull/42",
      checks: [{ name: "unit tests", status: "passed" }],
      filesChanged: 14,
      costUsd: 3.27,
    },
    ...overrides,
  };
}
