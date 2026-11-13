export const RUN_STATES = [
  "queued",
  "spec",
  "spec_gate",
  "design",
  "design_gate",
  "build_test",
  "verify",
  "release_gate",
  "deploy",
  "post_deploy_check",
  "done",
  "failed",
  "cancelled",
  "escalated",
] as const;

export type RunState = (typeof RUN_STATES)[number];

export const TERMINAL_STATES = ["done", "failed", "cancelled", "escalated"] as const satisfies readonly RunState[];

export type TerminalState = (typeof TERMINAL_STATES)[number];

export const GATE_STATES = ["spec_gate", "design_gate", "release_gate"] as const satisfies readonly RunState[];

export type GateState = (typeof GATE_STATES)[number];

/** States from which a run may be failed, cancelled, or escalated at any time. */
const ABORTABLE: RunState[] = ["failed", "cancelled", "escalated"];

/**
 * The complete transition table. Anything not listed is forbidden.
 * Terminal states have no outgoing transitions.
 */
export const ALLOWED_TRANSITIONS: Readonly<Record<RunState, readonly RunState[]>> = {
  // A run made from an audit report starts at build_test: the click is its spec, and it has no design.
  queued: ["spec", "build_test", ...ABORTABLE],
  spec: ["spec_gate", ...ABORTABLE],
  // Approve moves forward; request-changes sends the run back to the step before the gate.
  spec_gate: ["design", "spec", ...ABORTABLE],
  design: ["design_gate", ...ABORTABLE],
  design_gate: ["build_test", "design", ...ABORTABLE],
  // build_test -> build_test is a retry inside the test loop (capped, see machine.ts).
  build_test: ["build_test", "verify", ...ABORTABLE],
  verify: ["release_gate", "build_test", ...ABORTABLE],
  release_gate: ["deploy", "build_test", ...ABORTABLE],
  deploy: ["post_deploy_check", ...ABORTABLE],
  post_deploy_check: ["done", ...ABORTABLE],
  done: [],
  failed: [],
  cancelled: [],
  escalated: [],
};

export function isTerminal(state: RunState): state is TerminalState {
  return (TERMINAL_STATES as readonly RunState[]).includes(state);
}

export function isGateState(state: RunState): state is GateState {
  return (GATE_STATES as readonly RunState[]).includes(state);
}

export function canTransition(from: RunState, to: RunState): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}
