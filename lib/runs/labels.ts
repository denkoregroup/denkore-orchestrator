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
