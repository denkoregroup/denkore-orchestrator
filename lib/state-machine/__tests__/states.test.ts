/**
 * @jest-environment node
 */
import {
  ALLOWED_TRANSITIONS,
  RUN_STATES,
  TERMINAL_STATES,
  canTransition,
  isTerminal,
  type RunState,
} from "../states";

// The expected table is written out independently of the implementation so a
// change to ALLOWED_TRANSITIONS has to be mirrored here deliberately.
const ABORT: RunState[] = ["failed", "cancelled", "escalated"];
const EXPECTED: Record<RunState, RunState[]> = {
  queued: ["spec", "build_test", ...ABORT],
  spec: ["spec_gate", ...ABORT],
  spec_gate: ["design", "spec", ...ABORT],
  design: ["design_gate", ...ABORT],
  design_gate: ["build_test", "design", ...ABORT],
  build_test: ["build_test", "verify", ...ABORT],
  verify: ["release_gate", "build_test", ...ABORT],
  release_gate: ["deploy", "build_test", ...ABORT],
  deploy: ["post_deploy_check", ...ABORT],
  post_deploy_check: ["done", ...ABORT],
  done: [],
  failed: [],
  cancelled: [],
  escalated: [],
};

const pairs = RUN_STATES.flatMap((from) => RUN_STATES.map((to) => [from, to] as const));
const allowed = pairs.filter(([from, to]) => EXPECTED[from].includes(to));
const forbidden = pairs.filter(([from, to]) => !EXPECTED[from].includes(to));

describe("transition table", () => {
  it("covers every state", () => {
    expect(Object.keys(ALLOWED_TRANSITIONS).sort()).toEqual([...RUN_STATES].sort());
    expect(Object.keys(EXPECTED).sort()).toEqual([...RUN_STATES].sort());
  });

  it("matches the expected table exactly", () => {
    for (const state of RUN_STATES) {
      expect([...ALLOWED_TRANSITIONS[state]].sort()).toEqual([...EXPECTED[state]].sort());
    }
  });

  it.each(allowed)("allows %s -> %s", (from, to) => {
    expect(canTransition(from, to)).toBe(true);
  });

  it.each(forbidden)("forbids %s -> %s", (from, to) => {
    expect(canTransition(from, to)).toBe(false);
  });

  it("has no outgoing transitions from terminal states", () => {
    for (const state of TERMINAL_STATES) {
      expect(isTerminal(state)).toBe(true);
      expect(ALLOWED_TRANSITIONS[state]).toHaveLength(0);
    }
  });
});
