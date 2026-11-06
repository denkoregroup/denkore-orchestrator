import type { GateKind, RunState } from "@/lib/state-machine";
import type { StepName } from "@/lib/step-runner/types";
import type { RunSnapshot } from "./types";

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

  /** Marks a still-dispatched step failed (the runner never received it). */
  markStepFailed(stepKey: string): Promise<void>;

  /** Inserts the gate row. Conflict when the run already has a gate of this kind. */
  openGate(runId: string, kind: GateKind, sha: string): Promise<InsertResult>;

  /** Compare-and-set on the gate's commit. The database resets it to pending. */
  moveGate(gateId: string, fromSha: string, toSha: string): Promise<boolean>;

  logEvent(runId: string, kind: string, payload: Record<string, unknown>): Promise<void>;

  /** Non-terminal runs, oldest first. */
  listActiveRunIds(limit: number): Promise<string[]>;
}
