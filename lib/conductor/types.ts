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

/** What a run made from an audit report needs to know to be verified. */
export interface FixSnapshot {
  /** Ids of the findings the run was started for (the audit.fix_requested event); null if that event is missing. */
  findingIds: string[] | null;
  /**
   * The first audit report for the project made after the run entered post_deploy_check, or null while there
   * is none. Only looked up in that state.
   */
  nextReport: { id: string; startedAt: string; findingIds: string[] } | null;
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
  /**
   * Step keys the Conductor timed out (from conductor.step_timed_out events).
   * They count as failed even if a late completion later rewrites the row.
   */
  timedOutStepKeys: string[];
  /** Set only for a run made from an audit report (its prompt starts with the audit-fix marker). */
  fix: FixSnapshot | null;
}

export type ConductorAction =
  | { type: "wait"; reason: string }
  | { type: "dispatch"; step: StepName; attempt: number; ownerNote: string | null }
  | { type: "transition"; event: RunEvent }
  | { type: "open_gate"; kind: GateKind; sha: string }
  | { type: "move_gate"; gateId: string; fromSha: string; sha: string }
  | { type: "escalate"; reason: string }
  /** A later audit report shows the run's findings fixed: finish the run and record which report said so. */
  | { type: "verify_fix"; reportId: string; reportStartedAt: string }
  /** A dispatched step that never reported back: mark it failed, then normal failure handling runs. */
  | { type: "fail_step"; stepKey: string; reason: "timed_out" };
