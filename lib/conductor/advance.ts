import type { RegistryEntry } from "@/lib/registry/schema";
import { transition, type RunContext, type RunEvent } from "@/lib/state-machine";
import { stepKeyFor, type StepRunner } from "@/lib/step-runner/types";
import { buildStepInput } from "./contract";
import { decide, STEP_DEADLINE_SECONDS } from "./decide";
import { defaultConductorDeps } from "./defaults";
import { LIMITS } from "./limits";
import { STEP_TIMED_OUT_EVENT, type ConductorStore } from "./store";
import type { ConductorAction, RunSnapshot } from "./types";

export interface ConductorDeps {
  store: ConductorStore;
  /** A runner for one dispatch. The stub runner derives the step key from `attempt`. */
  runnerFor: (input: { attempt: number; entry: RegistryEntry }) => StepRunner;
  registryEntry: (registryId: string) => Promise<RegistryEntry | undefined>;
  /** ISO timestamp. One clock for state changes and dispatches keeps "since entering this state" comparable. */
  now: () => string;
}

export type AdvanceStop =
  | "waiting" // nothing to do until something outside changes
  | "escalated" // the run now needs the owner
  | "raced" // another caller changed the run first; it will carry on
  | "rejected" // the state machine refused the event (logged)
  | "not_found"
  | "loop_limit";

export interface AdvanceResult {
  runId: string;
  applied: ConductorAction[];
  stopped: AdvanceStop;
  reason?: string;
}

export const ESCALATION_REASONS = {
  notInRegistry: "This project isn’t in the registry, so its steps can’t be sent. Add it and run pnpm registry:sync.",
  dispatchFailed: "A step couldn’t be sent to the runner.",
  testsKeptFailing: (retries: number) =>
    `Tests kept failing after ${retries} ${retries === 1 ? "retry" : "retries"}.`,
  liveCheckFailed: "The live site check failed.",
  keptTimingOut: (retries: number) =>
    `Steps kept not reporting back in time after ${retries} ${retries === 1 ? "retry" : "retries"}. The runner may be down.`,
  liveCheckTimedOut: "The live site check didn't report back in time.",
} as const;

function contextOf(snapshot: RunSnapshot): RunContext {
  const gateKind =
    snapshot.state === "spec_gate" ? "spec" : snapshot.state === "design_gate" ? "design" : snapshot.state === "release_gate" ? "release" : null;
  const gateRow = gateKind ? snapshot.gates.find((g) => g.kind === gateKind) : undefined;
  return {
    state: snapshot.state,
    testFailures: snapshot.testFailures,
    maxTestRetries: snapshot.maxTestRetries,
    gate: gateRow ? { kind: gateRow.kind, commitSha: gateRow.commitSha } : null,
    approvals: [],
  };
}

/** Why the state machine escalated on its own (retry cap, failed live check). */
function reducerEscalationReason(event: RunEvent, snapshot: RunSnapshot): string {
  // The newest step is the one whose failure triggered this; say so if it timed out.
  const latest = snapshot.steps.at(-1);
  const timedOut = latest !== undefined && snapshot.timedOutStepKeys.includes(latest.stepKey);
  if (event.type === "check_failed") return timedOut ? ESCALATION_REASONS.liveCheckTimedOut : ESCALATION_REASONS.liveCheckFailed;
  return timedOut ? ESCALATION_REASONS.keptTimingOut(snapshot.maxTestRetries) : ESCALATION_REASONS.testsKeptFailing(snapshot.maxTestRetries);
}

/**
 * Moves one run forward as far as it can go right now: load, decide, apply,
 * repeat, until there is nothing to do, the run escalates, another caller
 * wins a race, or LIMITS.maxAdvanceLoops actions have been applied.
 */
export async function advanceRun(runId: string, deps: ConductorDeps = defaultConductorDeps()): Promise<AdvanceResult> {
  const { store } = deps;
  const applied: ConductorAction[] = [];
  const stop = (stopped: AdvanceStop, reason?: string): AdvanceResult => ({ runId, applied, stopped, reason });

  async function escalate(snapshot: RunSnapshot, reason: string): Promise<AdvanceResult> {
    const result = transition(contextOf(snapshot), { type: "escalate" });
    if (!result.ok) return stop("rejected", result.error);
    const won = await store.setState(
      runId,
      { state: snapshot.state, stateEnteredAt: snapshot.stateEnteredAt },
      { state: "escalated", testFailures: snapshot.testFailures, stateEnteredAt: deps.now() },
    );
    if (!won) return stop("raced");
    await store.logEvent(runId, "conductor.escalated", { reason, from: snapshot.state });
    return stop("escalated", reason);
  }

  for (let loop = 0; loop < LIMITS.maxAdvanceLoops; loop++) {
    const snapshot = await store.loadSnapshot(runId);
    if (!snapshot) return stop("not_found");
    const action = decide(snapshot, deps.now());

    switch (action.type) {
      case "wait":
        return stop("waiting", action.reason);

      case "escalate":
        applied.push(action);
        return escalate(snapshot, action.reason);

      case "transition": {
        const result = transition(contextOf(snapshot), action.event);
        if (!result.ok) {
          await store.logEvent(runId, "conductor.transition_rejected", { event: action.event.type, error: result.error });
          return stop("rejected", result.error);
        }
        const won = await store.setState(
          runId,
          { state: snapshot.state, stateEnteredAt: snapshot.stateEnteredAt },
          { state: result.run.state, testFailures: result.run.testFailures, stateEnteredAt: deps.now() },
        );
        if (!won) return stop("raced");
        applied.push(action);
        if (result.run.state === "escalated") {
          const reason = reducerEscalationReason(action.event, snapshot);
          await store.logEvent(runId, "conductor.escalated", { reason, from: snapshot.state });
          return stop("escalated", reason);
        }
        break;
      }

      case "dispatch": {
        const entry = snapshot.registryId ? await deps.registryEntry(snapshot.registryId) : undefined;
        if (!entry) {
          applied.push(action);
          return escalate(snapshot, ESCALATION_REASONS.notInRegistry);
        }
        const stepKey = stepKeyFor(runId, action.step, action.attempt);
        // The row exists before the runner hears about it, so a completion always has a step to land on.
        const inserted = await store.insertStep({
          runId,
          step: action.step,
          attempt: action.attempt,
          stepKey,
          dispatchedAt: deps.now(),
        });
        if (inserted === "conflict") return stop("raced");
        applied.push(action);
        try {
          const dispatched = await deps.runnerFor({ attempt: action.attempt, entry }).dispatch(
            buildStepInput({ runId, step: action.step, prompt: snapshot.prompt, entry, ownerNote: action.ownerNote }),
          );
          if (dispatched.stepKey !== stepKey) {
            throw new Error(`runner returned step key ${dispatched.stepKey}, expected ${stepKey}`);
          }
        } catch (e) {
          await store.markStepFailed(stepKey);
          await store.logEvent(runId, "conductor.dispatch_failed", {
            step: action.step,
            attempt: action.attempt,
            error: e instanceof Error ? e.message : "unknown error",
          });
          const after = await store.loadSnapshot(runId);
          return after ? escalate(after, ESCALATION_REASONS.dispatchFailed) : stop("not_found");
        }
        await store.logEvent(runId, "conductor.dispatched", {
          step: action.step,
          attempt: action.attempt,
          step_key: stepKey,
          owner_note: action.ownerNote !== null,
        });
        break;
      }

      case "open_gate":
        if ((await store.openGate(runId, action.kind, action.sha)) === "conflict") return stop("raced");
        applied.push(action);
        break;

      case "move_gate":
        if (!(await store.moveGate(action.gateId, action.fromSha, action.sha))) return stop("raced");
        applied.push(action);
        break;

      case "fail_step": {
        // Compare-and-set on the step: only a step still marked dispatched can be failed.
        // If it completed meanwhile, or another caller failed it first, stop quietly.
        if (!(await store.markStepFailed(action.stepKey))) return stop("raced");
        const step = snapshot.steps.find((s) => s.stepKey === action.stepKey);
        await store.logEvent(runId, STEP_TIMED_OUT_EVENT, {
          step_key: action.stepKey,
          step: step?.step ?? null,
          attempt: step?.attempt ?? null,
          reason: action.reason,
          after_seconds: STEP_DEADLINE_SECONDS,
        });
        applied.push(action);
        // The next loop sees a failed step and the usual failure handling runs.
        break;
      }
    }
  }
  return stop("loop_limit");
}
