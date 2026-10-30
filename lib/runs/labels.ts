import type { RunState } from "@/lib/state-machine/states";
import type { StepName } from "@/lib/step-runner/types";

/** What each run state means to the owner. Keyed by every RunState; the compiler rejects a missing one. */
export const RUN_STATE_LABELS = {
  queued: "Waiting to start",
  spec: "Writing the plan",
  spec_gate: "Needs your OK on the plan",
  design: "Designing",
  design_gate: "Needs your OK on the design",
  build_test: "Building and testing",
  verify: "Final checks",
  release_gate: "Needs your OK to go live",
  deploy: "Going live",
  post_deploy_check: "Checking the live site",
  done: "Done",
  failed: "Stopped: something failed",
  cancelled: "Cancelled",
  escalated: "Needs your attention",
} as const satisfies Record<RunState, string>;

export function runStateLabel(state: RunState): string {
  return RUN_STATE_LABELS[state];
}

export const STEP_LABELS = {
  spec: "Plan",
  design: "Design",
  build_test: "Build and test",
  verify: "Final checks",
  deploy: "Go live",
  post_deploy_check: "Live site check",
} as const satisfies Record<StepName, string>;

export const STEP_STATUS_LABELS = {
  dispatched: "In progress",
  succeeded: "Finished",
  failed: "Failed",
} as const;

const EVENT_KIND_LABELS: Record<string, string> = {
  "run.created": "Run created",
  "run.state_changed": "Run moved to a new stage",
  "step.completed": "Step finished",
  "gate.approve": "Approved",
  "gate.request_changes": "Changes requested",
  "gate.approval_voided": "Approval reset by a new commit",
};

/** Plain-language label for known event kinds; the raw kind otherwise. */
export function eventKindLabel(kind: string): string {
  return EVENT_KIND_LABELS[kind] ?? kind;
}

/** A one-line description that adds the new stage to state changes. */
export function eventDescription(kind: string, payload: unknown): string {
  if (kind === "run.state_changed" && payload && typeof payload === "object" && "to" in payload) {
    const to = (payload as { to: unknown }).to;
    if (typeof to === "string" && to in RUN_STATE_LABELS) {
      return `Now: ${RUN_STATE_LABELS[to as RunState]}`;
    }
  }
  return eventKindLabel(kind);
}

/** Who did it, in words. This is a single-owner app, so any owner actor is "You". */
export function actorLabel(actor: string): string {
  if (actor.startsWith("owner:")) return "You";
  if (actor === "system") return "System";
  if (actor === "runner") return "Runner";
  return actor;
}

/** States where the run is waiting on the owner. */
export const NEEDS_OWNER_STATES: readonly RunState[] = ["spec_gate", "design_gate", "release_gate", "escalated"];
