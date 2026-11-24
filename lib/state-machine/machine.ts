import { type Approval, type Gate, GATE_KIND_BY_STATE, openGate, updateGateSha } from "./gates";
import { canTransition, isGateState, isTerminal, type RunState } from "./states";

export const DEFAULT_MAX_TEST_RETRIES = 3;

export interface RunContext {
  state: RunState;
  /** Failures recorded in the build/test loop so far. */
  testFailures: number;
  /** Retries allowed before the run is escalated. */
  maxTestRetries: number;
  /** The gate for the current gate state, if any. */
  gate: Gate | null;
  /** Every approval the reducer accepted, oldest first. */
  approvals: readonly Approval[];
}

export type RunEvent =
  | { type: "start" }
  /** A run made from an audit report: the owner's click was its spec gate, so it goes straight to build and test. */
  | { type: "start_fix" }
  | { type: "spec_ready"; commitSha: string }
  | { type: "design_ready"; commitSha: string }
  | { type: "tests_passed" }
  | { type: "tests_failed" }
  | { type: "verify_passed"; commitSha: string }
  | { type: "verify_failed" }
  /** Passes the gate only if commitSha is the SHA the gate covers right now. */
  | { type: "approve"; approvedBy: string; commitSha: string }
  | { type: "request_changes" }
  | { type: "gate_sha_changed"; commitSha: string }
  | { type: "deployed" }
  | { type: "check_passed" }
  | { type: "check_failed" }
  | { type: "fail" }
  | { type: "cancel" }
  | { type: "escalate" };

export type TransitionResult =
  | { ok: true; run: RunContext }
  | { ok: false; error: string };

export function createRun(maxTestRetries = DEFAULT_MAX_TEST_RETRIES): RunContext {
  if (!Number.isInteger(maxTestRetries) || maxTestRetries < 0) {
    throw new Error("maxTestRetries must be a non-negative integer");
  }
  return { state: "queued", testFailures: 0, maxTestRetries, gate: null, approvals: [] };
}

const FORWARD_FROM_GATE = {
  spec_gate: "design",
  design_gate: "build_test",
  release_gate: "deploy",
} as const;

const BACK_FROM_GATE = {
  spec_gate: "spec",
  design_gate: "design",
  release_gate: "build_test",
} as const;

function reject(run: RunContext, event: RunEvent): TransitionResult {
  return { ok: false, error: `Event "${event.type}" is not allowed in state "${run.state}"` };
}

function moveTo(run: RunContext, to: RunState, patch: Partial<RunContext> = {}): TransitionResult {
  if (!canTransition(run.state, to)) {
    return { ok: false, error: `Transition ${run.state} -> ${to} is forbidden` };
  }
  return { ok: true, run: { ...run, gate: null, ...patch, state: to } };
}

function enterGate(run: RunContext, to: RunState, commitSha: string): TransitionResult {
  if (!isGateState(to)) throw new Error(`${to} is not a gate state`);
  try {
    return moveTo(run, to, { gate: openGate(GATE_KIND_BY_STATE[to], commitSha) });
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

function recordTestFailure(run: RunContext): TransitionResult {
  const testFailures = run.testFailures + 1;
  if (testFailures > run.maxTestRetries) {
    return moveTo(run, "escalated", { testFailures });
  }
  return moveTo(run, "build_test", { testFailures });
}

/** Pure reducer: returns the next run context or an error. Never mutates its input. */
export function transition(run: RunContext, event: RunEvent): TransitionResult {
  if (isTerminal(run.state)) {
    return { ok: false, error: `Run is in terminal state "${run.state}"` };
  }

  switch (event.type) {
    case "fail":
      return moveTo(run, "failed");
    case "cancel":
      return moveTo(run, "cancelled");
    case "escalate":
      return moveTo(run, "escalated");
  }

  switch (run.state) {
    case "queued":
      if (event.type === "start") return moveTo(run, "spec");
      if (event.type === "start_fix") return moveTo(run, "build_test");
      return reject(run, event);
    case "spec":
      return event.type === "spec_ready"
        ? enterGate(run, "spec_gate", event.commitSha)
        : reject(run, event);
    case "design":
      return event.type === "design_ready"
        ? enterGate(run, "design_gate", event.commitSha)
        : reject(run, event);
    case "build_test":
      if (event.type === "tests_passed") return moveTo(run, "verify");
      if (event.type === "tests_failed") return recordTestFailure(run);
      return reject(run, event);
    case "verify":
      if (event.type === "verify_passed") return enterGate(run, "release_gate", event.commitSha);
      if (event.type === "verify_failed") return recordTestFailure(run);
      return reject(run, event);
    case "spec_gate":
    case "design_gate":
    case "release_gate": {
      const gate = run.gate;
      if (!gate) return { ok: false, error: `Gate state "${run.state}" has no gate` };
      if (event.type === "approve") {
        if (event.commitSha !== gate.commitSha) {
          return {
            ok: false,
            error: `Approval is for ${event.commitSha} but the gate covers ${gate.commitSha}`,
          };
        }
        if (!event.approvedBy) return { ok: false, error: "Approval has no approver" };
        const approval: Approval = { kind: gate.kind, approvedBy: event.approvedBy, commitSha: gate.commitSha };
        return moveTo(run, FORWARD_FROM_GATE[run.state], { approvals: [...run.approvals, approval] });
      }
      if (event.type === "request_changes") return moveTo(run, BACK_FROM_GATE[run.state]);
      if (event.type === "gate_sha_changed") {
        try {
          return { ok: true, run: { ...run, gate: updateGateSha(gate, event.commitSha) } };
        } catch (e) {
          return { ok: false, error: (e as Error).message };
        }
      }
      return reject(run, event);
    }
    case "deploy":
      return event.type === "deployed" ? moveTo(run, "post_deploy_check") : reject(run, event);
    case "post_deploy_check":
      if (event.type === "check_passed") return moveTo(run, "done");
      if (event.type === "check_failed") return moveTo(run, "escalated");
      return reject(run, event);
  }
  return reject(run, event);
}
