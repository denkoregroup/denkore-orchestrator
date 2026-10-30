import type { GateKind, RunEvent, RunState } from "@/lib/state-machine";
import type { StepName } from "@/lib/step-runner/types";

export type StepStatus = "dispatched" | "succeeded" | "failed";
export type GateStatus = "pending" | "approved" | "changes_requested";

export interface StepSnapshot {
  step: StepName;
  attempt: number;
  stepKey: string;
  status: StepStatus;
  commitSha: string | null;
  prUrl: string | null;
  costUsd: number | null;
  /** Written by the Conductor from the app clock, like RunSnapshot.stateEnteredAt. */
  dispatchedAt: string;
}

export interface GateDecision {
  decision: "approve" | "request_changes";
  commitSha: string;
  approvedBy: string;
  note: string | null;
  createdAt: string;
}

export interface GateSnapshot {
  id: string;
  kind: GateKind;
  commitSha: string;
  status: GateStatus;
  /** The newest approvals row for this gate, if any. */
  latestDecision: GateDecision | null;
}

/** Everything decide() needs to know about one run. */
export interface RunSnapshot {
  runId: string;
  state: RunState;
  /**
   * runs.updated_at: set by every Conductor transition, so it marks when the
   * run entered its current state. Also the version for compare-and-set.
   */
  stateEnteredAt: string;
  testFailures: number;
  maxTestRetries: number;
  prompt: string;
  /** The project's registry id, or null if the project row is missing. */
  registryId: string | null;
  /** Oldest first. */
  steps: StepSnapshot[];
  gates: GateSnapshot[];
  totalCostUsd: number;
}

export type ConductorAction =
  | { type: "wait"; reason: string }
  | { type: "dispatch"; step: StepName; attempt: number; ownerNote: string | null }
  | { type: "transition"; event: RunEvent }
  | { type: "open_gate"; kind: GateKind; sha: string }
  | { type: "move_gate"; gateId: string; fromSha: string; sha: string }
  | { type: "escalate"; reason: string };
