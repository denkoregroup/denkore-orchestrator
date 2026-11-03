import { randomUUID } from "node:crypto";
import { isTerminal, type GateKind, type RunState } from "@/lib/state-machine";
import type { StepName } from "@/lib/step-runner/types";
import { STEP_TIMED_OUT_EVENT, type ConductorStore, type InsertResult } from "./store";
import type { GateDecision, GateStatus, RunSnapshot, StepSnapshot } from "./types";

/**
 * In-memory ConductorStore for tests. It mimics the database's unique keys
 * and the triggers the Conductor relies on: record_step_completion,
 * approvals_before/after_insert, gates_sha_changed and run.state_changed.
 * Every method yields once before touching state, so concurrent callers
 * interleave the way separate requests would.
 */

interface MemoryRun {
  id: string;
  state: RunState;
  updatedAt: string;
  createdAt: string;
  testFailures: number;
  maxTestRetries: number;
  prompt: string;
  registryId: string | null;
}

interface MemoryGate {
  id: string;
  runId: string;
  kind: GateKind;
  commitSha: string;
  status: GateStatus;
  decisions: GateDecision[];
}

export interface MemoryEvent {
  runId: string;
  kind: string;
  payload: Record<string, unknown>;
}

const yieldOnce = () => new Promise<void>((resolve) => setImmediate(resolve));

export class MemoryConductorStore implements ConductorStore {
  readonly runs = new Map<string, MemoryRun>();
  readonly steps: Array<StepSnapshot & { runId: string }> = [];
  readonly gates: MemoryGate[] = [];
  readonly events: MemoryEvent[] = [];
  private clock = Date.parse("2026-10-30T10:00:00.000Z");

  /** A monotonic clock, shared with the executor through `now`. */
  now = (): string => {
    this.clock += 1000;
    return new Date(this.clock).toISOString();
  };

  /** Moves the clock forward, e.g. past a step's deadline. */
  advanceClock(seconds: number): void {
    this.clock += seconds * 1000;
  }

  addRun(input: { prompt?: string; registryId?: string | null; maxTestRetries?: number; state?: RunState } = {}): string {
    const id = randomUUID();
    const at = this.now();
    this.runs.set(id, {
      id,
      state: input.state ?? "queued",
      updatedAt: at,
      createdAt: at,
      testFailures: 0,
      maxTestRetries: input.maxTestRetries ?? 3,
      prompt: input.prompt ?? "Build the booking page",
      registryId: input.registryId === undefined ? "example-app" : input.registryId,
    });
    return id;
  }

  // ---- ConductorStore -----------------------------------------------------

  async loadSnapshot(runId: string): Promise<RunSnapshot | null> {
    await yieldOnce();
    const run = this.runs.get(runId);
    if (!run) return null;
    const steps: StepSnapshot[] = this.steps
      .filter((s) => s.runId === runId)
      .map((s) => ({
        step: s.step,
        attempt: s.attempt,
        stepKey: s.stepKey,
        status: s.status,
        commitSha: s.commitSha,
        prUrl: s.prUrl,
        costUsd: s.costUsd,
        dispatchedAt: s.dispatchedAt,
      }));
    return {
      runId,
      state: run.state,
      stateEnteredAt: run.updatedAt,
      testFailures: run.testFailures,
      maxTestRetries: run.maxTestRetries,
      prompt: run.prompt,
      registryId: run.registryId,
      steps,
      gates: this.gates
        .filter((g) => g.runId === runId)
        .map((g) => ({
          id: g.id,
          kind: g.kind,
          commitSha: g.commitSha,
          status: g.status,
          latestDecision: g.decisions.at(-1) ?? null,
        })),
      totalCostUsd: steps.reduce((sum, s) => sum + (s.costUsd ?? 0), 0),
      timedOutStepKeys: this.events
        .filter((e) => e.runId === runId && e.kind === STEP_TIMED_OUT_EVENT)
        .map((e) => String(e.payload.step_key)),
    };
  }

  async setState(
    runId: string,
    expected: { state: RunState; stateEnteredAt: string },
    next: { state: RunState; testFailures: number; stateEnteredAt: string },
  ): Promise<boolean> {
    await yieldOnce();
    const run = this.runs.get(runId);
    if (!run || run.state !== expected.state || run.updatedAt !== expected.stateEnteredAt) return false;
    const from = run.state;
    Object.assign(run, { state: next.state, testFailures: next.testFailures, updatedAt: next.stateEnteredAt });
    if (from !== next.state) this.events.push({ runId, kind: "run.state_changed", payload: { from, to: next.state } });
    return true;
  }

  async insertStep(row: { runId: string; step: StepName; attempt: number; stepKey: string; dispatchedAt: string }): Promise<InsertResult> {
    await yieldOnce();
    if (this.steps.some((s) => s.stepKey === row.stepKey)) return "conflict";
    this.steps.push({
      runId: row.runId,
      step: row.step,
      attempt: row.attempt,
      stepKey: row.stepKey,
      status: "dispatched",
      commitSha: null,
      prUrl: null,
      costUsd: null,
      dispatchedAt: row.dispatchedAt,
    });
    return "inserted";
  }

  async markStepFailed(stepKey: string): Promise<boolean> {
    await yieldOnce();
    const step = this.steps.find((s) => s.stepKey === stepKey && s.status === "dispatched");
    if (!step) return false;
    step.status = "failed";
    return true;
  }

  async openGate(runId: string, kind: GateKind, sha: string): Promise<InsertResult> {
    await yieldOnce();
    if (this.gates.some((g) => g.runId === runId && g.kind === kind)) return "conflict";
    this.gates.push({ id: randomUUID(), runId, kind, commitSha: sha, status: "pending", decisions: [] });
    return "inserted";
  }

  async moveGate(gateId: string, fromSha: string, toSha: string): Promise<boolean> {
    await yieldOnce();
    const gate = this.gates.find((g) => g.id === gateId);
    if (!gate || gate.commitSha !== fromSha) return false;
    this.setGateSha(gate, toSha);
    return true;
  }

  async logEvent(runId: string, kind: string, payload: Record<string, unknown>): Promise<void> {
    await yieldOnce();
    this.events.push({ runId, kind, payload });
  }

  async listActiveRunIds(limit: number): Promise<string[]> {
    await yieldOnce();
    return [...this.runs.values()]
      .filter((r) => !isTerminal(r.state))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
      .slice(0, limit)
      .map((r) => r.id);
  }

  // ---- What the webhook, the owner and the runner do (test drivers) -------

  /** Like record_step_completion: idempotent on the step key. Returns false for a replay. */
  completeStep(
    stepKey: string,
    output: { status: "succeeded" | "failed"; commitSha?: string | null; prUrl?: string | null; costUsd?: number },
  ): boolean {
    if (this.events.some((e) => e.kind === "step.completed" && e.payload.stepKey === stepKey)) return false;
    const step = this.steps.find((s) => s.stepKey === stepKey);
    if (!step) throw new Error(`no step ${stepKey}`);
    Object.assign(step, {
      status: output.status,
      commitSha: output.commitSha ?? null,
      prUrl: output.prUrl ?? null,
      costUsd: output.costUsd ?? 0,
    });
    this.events.push({ runId: this.stepRun(stepKey), kind: "step.completed", payload: { stepKey } });
    return true;
  }

  /** Like an owner's approvals insert plus its triggers. Throws the trigger's errors. */
  decide(gateId: string, decision: "approve" | "request_changes", commitSha: string, note: string | null = null) {
    const gate = this.gates.find((g) => g.id === gateId);
    if (!gate) throw new Error("no gate");
    if (commitSha !== gate.commitSha) throw new Error(`approval is for ${commitSha}, but the gate now covers ${gate.commitSha}`);
    if (gate.status !== "pending") throw new Error(`gate is already ${gate.status}`);
    gate.status = decision === "approve" ? "approved" : "changes_requested";
    gate.decisions.push({ decision, commitSha, approvedBy: "owner-id", note, createdAt: this.now() });
  }

  /** Like the runner (service role) moving a gate's commit; the trigger resets it to pending. */
  setGateSha(gate: MemoryGate, sha: string) {
    if (gate.commitSha === sha) return;
    gate.commitSha = sha;
    gate.status = "pending";
    this.events.push({ runId: gate.runId, kind: "gate.approval_voided", payload: { gate_id: gate.id } });
  }

  gateFor(runId: string, kind: GateKind): MemoryGate | undefined {
    return this.gates.find((g) => g.runId === runId && g.kind === kind);
  }

  /** The newest step of a run, which is usually the one waiting for completion. */
  latestStep(runId: string): StepSnapshot & { runId: string } {
    const steps = this.steps.filter((s) => s.runId === runId);
    if (steps.length === 0) throw new Error("no steps");
    return steps[steps.length - 1];
  }

  private stepRun(stepKey: string): string {
    return this.steps.find((s) => s.stepKey === stepKey)!.runId;
  }
}
