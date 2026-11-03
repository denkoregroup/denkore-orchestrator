import type { GateKind, RunState } from "@/lib/state-machine";
import type { StepName } from "@/lib/step-runner/types";
import type { RunSnapshot } from "./types";

/** Written when the Conductor fails a step that never reported back. Its payload carries step_key. */
export const STEP_TIMED_OUT_EVENT = "conductor.step_timed_out";

/** "conflict" means another caller already wrote the same row: stop quietly. */
export type InsertResult = "inserted" | "conflict";

/** Everything the Conductor reads and writes. Supabase in production, memory in tests. */
export interface ConductorStore {
  loadSnapshot(runId: string): Promise<RunSnapshot | null>;

  /**
   * Compare-and-set: changes the run only if it is still in `expected.state`
   * with the same `stateEnteredAt` (runs.updated_at). Returns false when
   * another caller moved it first.
   */
  setState(
    runId: string,
    expected: { state: RunState; stateEnteredAt: string },
    next: { state: RunState; testFailures: number; stateEnteredAt: string },
  ): Promise<boolean>;

  /** Inserts a dispatched steps row. Conflict when step_key already exists. */
  insertStep(row: {
    runId: string;
    step: StepName;
    attempt: number;
    stepKey: string;
    dispatchedAt: string;
  }): Promise<InsertResult>;

  /**
   * Compare-and-set: marks the step failed only if it is still dispatched.
   * Returns false when it already completed or another caller failed it first.
   */
  markStepFailed(stepKey: string): Promise<boolean>;

  /** Inserts the gate row. Conflict when the run already has a gate of this kind. */
  openGate(runId: string, kind: GateKind, sha: string): Promise<InsertResult>;

  /** Compare-and-set on the gate's commit. The database resets it to pending. */
  moveGate(gateId: string, fromSha: string, toSha: string): Promise<boolean>;

  logEvent(runId: string, kind: string, payload: Record<string, unknown>): Promise<void>;

  /** Non-terminal runs, oldest first. */
  listActiveRunIds(limit: number): Promise<string[]>;
}
