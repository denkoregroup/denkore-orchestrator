/**
 * @jest-environment node
 */
import { approveGate, isGateApproved, openGate, updateGateSha } from "../gates";
import { createRun, transition, type RunContext, type RunEvent } from "../machine";
import { RUN_STATES, TERMINAL_STATES, type RunState } from "../states";

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);

function apply(run: RunContext, ...events: RunEvent[]): RunContext {
  return events.reduce((current, event) => {
    const result = transition(current, event);
    if (!result.ok) throw new Error(result.error);
    return result.run;
  }, run);
}

function approveCurrent(run: RunContext, sha = SHA_A): RunContext {
  if (!run.gate) throw new Error("no gate");
  return { ...run, gate: approveGate(run.gate, { approvedBy: "owner", commitSha: sha }) };
}

/** Drives a fresh run into `state` along the happy path. */
function runAt(state: RunState, maxTestRetries = 3): RunContext {
  let run = createRun(maxTestRetries);
  const path: Array<(r: RunContext) => RunContext> = [
    (r) => apply(r, { type: "start" }),
    (r) => apply(r, { type: "spec_ready", commitSha: SHA_A }),
    (r) => apply(approveCurrent(r), { type: "approve" }),
    (r) => apply(r, { type: "design_ready", commitSha: SHA_A }),
    (r) => apply(approveCurrent(r), { type: "approve" }),
    (r) => apply(r, { type: "tests_passed" }),
    (r) => apply(r, { type: "verify_passed", commitSha: SHA_A }),
    (r) => apply(approveCurrent(r), { type: "approve" }),
    (r) => apply(r, { type: "deployed" }),
    (r) => apply(r, { type: "check_passed" }),
  ];
  for (const step of path) {
    if (run.state === state) return run;
    run = step(run);
  }
  if (run.state !== state) throw new Error(`cannot reach ${state} on happy path`);
  return run;
}

const ALL_EVENTS: RunEvent[] = [
  { type: "start" },
  { type: "spec_ready", commitSha: SHA_A },
  { type: "design_ready", commitSha: SHA_A },
  { type: "tests_passed" },
  { type: "tests_failed" },
  { type: "verify_passed", commitSha: SHA_A },
  { type: "verify_failed" },
  { type: "approve" },
  { type: "request_changes" },
  { type: "gate_sha_changed", commitSha: SHA_B },
  { type: "deployed" },
  { type: "check_passed" },
  { type: "check_failed" },
  { type: "fail" },
  { type: "cancel" },
  { type: "escalate" },
];

const NON_TERMINAL = RUN_STATES.filter(
  (s) => !(TERMINAL_STATES as readonly RunState[]).includes(s),
);

describe("happy path", () => {
  it("walks every forward state to done", () => {
    const seen: RunState[] = [];
    for (const state of RUN_STATES.slice(0, 11)) {
      seen.push(runAt(state).state);
    }
    expect(seen).toEqual(RUN_STATES.slice(0, 11));
  });

  it("stores the commit SHA on gates it opens", () => {
    const run = runAt("spec_gate");
    expect(run.gate).toEqual({ kind: "spec", commitSha: SHA_A, approval: null });
  });
});

describe("event-driven transitions", () => {
  // Every (non-terminal state, event) pair: either the expected next state or a rejection.
  const expectations: Record<string, RunState | null> = {
    "queued:start": "spec",
    "spec:spec_ready": "spec_gate",
    "spec_gate:approve": "design",
    "spec_gate:request_changes": "spec",
    "spec_gate:gate_sha_changed": "spec_gate",
    "design:design_ready": "design_gate",
    "design_gate:approve": "build_test",
    "design_gate:request_changes": "design",
    "design_gate:gate_sha_changed": "design_gate",
    "build_test:tests_passed": "verify",
    "build_test:tests_failed": "build_test",
    "verify:verify_passed": "release_gate",
    "verify:verify_failed": "build_test",
    "release_gate:approve": "deploy",
    "release_gate:request_changes": "build_test",
    "release_gate:gate_sha_changed": "release_gate",
    "deploy:deployed": "post_deploy_check",
    "post_deploy_check:check_passed": "done",
    "post_deploy_check:check_failed": "escalated",
  };

  const cases = NON_TERMINAL.flatMap((state) =>
    ALL_EVENTS.map((event) => [state, event] as const),
  );

  it.each(cases)("%s + %o", (state, event) => {
    let run = runAt(state);
    if (event.type === "approve" && run.gate) run = approveCurrent(run);
    const result = transition(run, event);
    const abort = { fail: "failed", cancel: "cancelled", escalate: "escalated" } as const;
    const expected =
      event.type in abort
        ? abort[event.type as keyof typeof abort]
        : (expectations[`${state}:${event.type}`] ?? null);
    if (expected === null) {
      expect(result.ok).toBe(false);
    } else {
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.run.state).toBe(expected);
    }
  });

  it.each(
    TERMINAL_STATES.flatMap((state) => ALL_EVENTS.map((event) => [state, event] as const)),
  )("terminal %s rejects %o", (state, event) => {
    const run: RunContext = { ...createRun(), state };
    expect(transition(run, event).ok).toBe(false);
  });

  it("does not mutate its input", () => {
    const run = createRun();
    const snapshot = structuredClone(run);
    transition(run, { type: "start" });
    expect(run).toEqual(snapshot);
  });

  it("rejects a gate entry with an invalid SHA", () => {
    const result = transition(runAt("spec"), { type: "spec_ready", commitSha: "not-a-sha" });
    expect(result.ok).toBe(false);
  });
});

describe("gate approvals", () => {
  it("refuses to pass a gate without an approval", () => {
    const result = transition(runAt("spec_gate"), { type: "approve" });
    expect(result.ok).toBe(false);
  });

  it("refuses an approval for a different SHA than the gate covers", () => {
    const gate = openGate("release", SHA_A);
    expect(() => approveGate(gate, { approvedBy: "owner", commitSha: SHA_B })).toThrow();
  });

  it("voids the approval when the gate SHA changes", () => {
    const approved = approveCurrent(runAt("release_gate"));
    expect(isGateApproved(approved.gate!)).toBe(true);

    const moved = apply(approved, { type: "gate_sha_changed", commitSha: SHA_B });
    expect(moved.gate?.commitSha).toBe(SHA_B);
    expect(moved.gate?.approval).toBeNull();
    expect(isGateApproved(moved.gate!)).toBe(false);
    expect(transition(moved, { type: "approve" }).ok).toBe(false);

    // A fresh approval for the new SHA is accepted.
    const reapproved = approveCurrent(moved, SHA_B);
    expect(apply(reapproved, { type: "approve" }).state).toBe("deploy");
  });

  it("treats a stale approval as invalid even if left on the gate", () => {
    const gate = approveGate(openGate("spec", SHA_A), { approvedBy: "owner", commitSha: SHA_A });
    expect(isGateApproved({ ...gate, commitSha: SHA_B })).toBe(false);
  });

  it("keeps the approval when the SHA is unchanged", () => {
    const gate = approveGate(openGate("spec", SHA_A), { approvedBy: "owner", commitSha: SHA_A });
    expect(updateGateSha(gate, SHA_A)).toBe(gate);
  });

  it("clears the gate after leaving the gate state", () => {
    const run = apply(approveCurrent(runAt("spec_gate")), { type: "approve" });
    expect(run.gate).toBeNull();
  });
});

describe("test loop retry cap", () => {
  it("retries up to the cap, then escalates", () => {
    let run = runAt("build_test", 2);
    run = apply(run, { type: "tests_failed" });
    expect(run).toMatchObject({ state: "build_test", testFailures: 1 });
    run = apply(run, { type: "tests_failed" });
    expect(run).toMatchObject({ state: "build_test", testFailures: 2 });
    run = apply(run, { type: "tests_failed" });
    expect(run).toMatchObject({ state: "escalated", testFailures: 3 });
  });

  it("counts verify failures against the same cap", () => {
    let run = runAt("build_test", 1);
    run = apply(run, { type: "tests_failed" }, { type: "tests_passed" }, { type: "verify_failed" });
    expect(run.state).toBe("escalated");
  });

  it("escalates on the first failure when the cap is zero", () => {
    expect(apply(runAt("build_test", 0), { type: "tests_failed" }).state).toBe("escalated");
  });

  it("rejects an invalid cap", () => {
    expect(() => createRun(-1)).toThrow();
    expect(() => createRun(1.5)).toThrow();
  });
});
