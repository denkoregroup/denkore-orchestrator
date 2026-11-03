import { GATE_KIND_BY_STATE, isGateState, isTerminal, type GateKind, type GateState, type RunState } from "@/lib/state-machine";
import type { StepName } from "@/lib/step-runner/types";
import { LIMITS } from "./limits";
import type { ConductorAction, GateSnapshot, RunSnapshot, StepSnapshot } from "./types";

type WorkState = Extract<RunState, StepName>;

const WORK_STATES: readonly WorkState[] = ["spec", "design", "build_test", "verify", "deploy", "post_deploy_check"];

/** The step whose commit a gate reviews. */
const SOURCE_STEP: Record<GateState, StepName> = {
  spec_gate: "spec",
  design_gate: "design",
  release_gate: "verify",
};

/** The gate a step's work is reviewed at; its change notes go into the step's task. */
const REVIEWED_AT: Partial<Record<StepName, GateKind>> = {
  spec: "spec",
  design: "design",
  build_test: "release",
  verify: "release",
};

const STEP_NOUN: Record<StepName, string> = {
  spec: "plan",
  design: "design",
  build_test: "build",
  verify: "final check",
  deploy: "go-live",
  post_deploy_check: "live site check",
};

export const REASONS = {
  tooManySteps: `This run used more than ${LIMITS.maxStepsPerRun} steps.`,
  tooExpensive: `This run cost more than $${LIMITS.maxCostUsd.toFixed(2)}.`,
  stepFailed: (step: StepName) => `The ${STEP_NOUN[step]} step failed.`,
  noCommit: (step: StepName) => `The ${STEP_NOUN[step]} step finished without a commit to review.`,
  noChange: (step: StepName) =>
    `The ${STEP_NOUN[step]} was sent back for changes, but no change was produced.`,
  noReviewCommit: "There is no commit for this review.",
  timedOut: (step: StepName) =>
    `The ${STEP_NOUN[step]} step didn't report back within ${Math.round(STEP_DEADLINE_SECONDS / 60)} minutes.`,
} as const;

/** How long a dispatched step may go without reporting back before it is failed. */
export const STEP_DEADLINE_SECONDS = LIMITS.stepTimeoutSeconds + LIMITS.stepTimeoutGraceSeconds;

/** Timestamps arrive in different ISO shapes (Z or +00:00, ms or µs); compare instants. */
const at = (iso: string) => Date.parse(iso);

function isWorkState(state: RunState): state is WorkState {
  return (WORK_STATES as readonly RunState[]).includes(state);
}

function newest(steps: StepSnapshot[], predicate: (s: StepSnapshot) => boolean): StepSnapshot | null {
  for (let i = steps.length - 1; i >= 0; i--) if (predicate(steps[i])) return steps[i];
  return null;
}

function gateOf(snapshot: RunSnapshot, kind: GateKind): GateSnapshot | null {
  return snapshot.gates.find((g) => g.kind === kind) ?? null;
}

/** The note from a "request changes" that is still open on the gate this step feeds. */
function ownerNoteFor(snapshot: RunSnapshot, step: StepName): string | null {
  const kind = REVIEWED_AT[step];
  const gate = kind ? gateOf(snapshot, kind) : null;
  if (gate?.status !== "changes_requested") return null;
  return gate.latestDecision?.decision === "request_changes" ? gate.latestDecision.note : null;
}

/** True if this SHA was already sent back for changes at the gate this step feeds. */
function sameShaWasSentBack(snapshot: RunSnapshot, step: StepName, sha: string): boolean {
  const kind = REVIEWED_AT[step];
  const gate = kind ? gateOf(snapshot, kind) : null;
  return gate?.status === "changes_requested" && gate.commitSha === sha;
}

function dispatchOrEscalate(snapshot: RunSnapshot, step: StepName): ConductorAction {
  if (snapshot.steps.length + 1 > LIMITS.maxStepsPerRun) {
    return { type: "escalate", reason: REASONS.tooManySteps };
  }
  const attempt = snapshot.steps.filter((s) => s.step === step).length + 1;
  return { type: "dispatch", step, attempt, ownerNote: ownerNoteFor(snapshot, step) };
}

function onSucceeded(snapshot: RunSnapshot, step: WorkState, done: StepSnapshot): ConductorAction {
  const sha = done.commitSha;
  const produced = sha !== null || done.prUrl !== null;
  switch (step) {
    case "spec":
    case "design":
      if (!sha) return { type: "escalate", reason: REASONS.noCommit(step) };
      if (sameShaWasSentBack(snapshot, step, sha)) return { type: "escalate", reason: REASONS.noChange(step) };
      return { type: "transition", event: { type: step === "spec" ? "spec_ready" : "design_ready", commitSha: sha } };
    case "verify":
      if (!sha) return { type: "transition", event: { type: "verify_failed" } };
      if (sameShaWasSentBack(snapshot, step, sha)) return { type: "escalate", reason: REASONS.noChange(step) };
      return { type: "transition", event: { type: "verify_passed", commitSha: sha } };
    case "build_test":
      return { type: "transition", event: { type: produced ? "tests_passed" : "tests_failed" } };
    case "deploy":
      return produced ? { type: "transition", event: { type: "deployed" } } : { type: "escalate", reason: REASONS.stepFailed(step) };
    case "post_deploy_check":
      return { type: "transition", event: { type: produced ? "check_passed" : "check_failed" } };
  }
}

function onFailed(step: WorkState, timedOut: boolean): ConductorAction {
  switch (step) {
    case "spec":
    case "design":
    case "deploy":
      return { type: "escalate", reason: timedOut ? REASONS.timedOut(step) : REASONS.stepFailed(step) };
    case "build_test":
      return { type: "transition", event: { type: "tests_failed" } };
    case "verify":
      return { type: "transition", event: { type: "verify_failed" } };
    case "post_deploy_check":
      return { type: "transition", event: { type: "check_failed" } };
  }
}

function decideWork(snapshot: RunSnapshot, step: WorkState, now: string): ConductorAction {
  // Only a step dispatched since the run entered this state counts; older ones belong to an earlier visit.
  const current = newest(snapshot.steps, (s) => s.step === step && at(s.dispatchedAt) >= at(snapshot.stateEnteredAt));
  if (!current) return dispatchOrEscalate(snapshot, step);
  if (current.status === "dispatched") {
    if (at(now) - at(current.dispatchedAt) > STEP_DEADLINE_SECONDS * 1000) {
      return { type: "fail_step", stepKey: current.stepKey, reason: "timed_out" };
    }
    return { type: "wait", reason: `Waiting for the ${STEP_NOUN[step]} step.` };
  }
  return current.status === "succeeded"
    ? onSucceeded(snapshot, step, current)
    : onFailed(step, snapshot.timedOutStepKeys.includes(current.stepKey));
}

function decideGate(snapshot: RunSnapshot, state: GateState): ConductorAction {
  const kind = GATE_KIND_BY_STATE[state];
  const source = newest(snapshot.steps, (s) => s.step === SOURCE_STEP[state] && s.status === "succeeded" && s.commitSha !== null);
  const sha = source?.commitSha;
  if (!sha) return { type: "escalate", reason: REASONS.noReviewCommit };

  const gate = gateOf(snapshot, kind);
  if (!gate) return { type: "open_gate", kind, sha };
  if (gate.commitSha !== sha) return { type: "move_gate", gateId: gate.id, fromSha: gate.commitSha, sha };

  const decision = gate.latestDecision;
  switch (gate.status) {
    case "pending":
      return { type: "wait", reason: "Waiting for your OK." };
    case "approved":
      // Only an approval for the SHA the gate covers now counts.
      if (decision?.decision === "approve" && decision.commitSha === gate.commitSha) {
        return { type: "transition", event: { type: "approve", approvedBy: decision.approvedBy, commitSha: decision.commitSha } };
      }
      return { type: "wait", reason: "Waiting for an approval of the current commit." };
    case "changes_requested":
      // Backstop: a decision made before the run re-entered this gate means the same SHA came back.
      if (decision && at(decision.createdAt) < at(snapshot.stateEnteredAt)) {
        return { type: "escalate", reason: REASONS.noChange(SOURCE_STEP[state]) };
      }
      return { type: "transition", event: { type: "request_changes" } };
  }
}

/**
 * Pure: one run snapshot and the current time in, the single next action out.
 * `now` is passed in (never read from the clock here) so tests can pin it.
 */
export function decide(input: RunSnapshot, now: string): ConductorAction {
  // A timed-out step stays failed even if a late completion rewrote its row:
  // a retry may already be running, and the late result must not move the run.
  const timedOut = new Set(input.timedOutStepKeys);
  const snapshot: RunSnapshot = timedOut.size
    ? { ...input, steps: input.steps.map((s) => (timedOut.has(s.stepKey) ? { ...s, status: "failed" as const } : s)) }
    : input;
  const { state } = snapshot;
  if (isTerminal(state)) return { type: "wait", reason: "The run is finished." };
  if (snapshot.totalCostUsd > LIMITS.maxCostUsd) return { type: "escalate", reason: REASONS.tooExpensive };
  if (snapshot.steps.length > LIMITS.maxStepsPerRun) return { type: "escalate", reason: REASONS.tooManySteps };

  if (state === "queued") return { type: "transition", event: { type: "start" } };
  if (isWorkState(state)) return decideWork(snapshot, state, now);
  if (isGateState(state)) return decideGate(snapshot, state);
  return { type: "wait", reason: `Nothing to do in ${state}.` };
}
