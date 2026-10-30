/**
 * @jest-environment node
 */
import { openGate, updateGateSha } from "../gates";
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

const approve = (commitSha = SHA_A): RunEvent => ({ type: "approve", approvedBy: "owner", commitSha });

/** Drives a fresh run into `state` along the happy path. */
function runAt(state: RunState, maxTestRetries = 3): RunContext {
  let run = createRun(maxTestRetries);
  const path: Array<(r: RunContext) => RunContext> = [
    (r) => apply(r, { type: "start" }),
    (r) => apply(r, { type: "spec_ready", commitSha: SHA_A }),
    (r) => apply(r, approve()),
    (r) => apply(r, { type: "design_ready", commitSha: SHA_A }),
    (r) => apply(r, approve()),
    (r) => apply(r, { type: "tests_passed" }),
    (r) => apply(r, { type: "verify_passed", commitSha: SHA_A }),
    (r) => apply(r, approve()),
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
  approve(),
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
    expect(run.gate).toEqual({ kind: "spec", commitSha: SHA_A });
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
    const run = runAt(state);
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
  it("passes the gate when the approval is for the gate's SHA, and records it", () => {
    const result = transition(runAt("spec_gate"), approve(SHA_A));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.run.state).toBe("design");
    expect(result.run.approvals).toEqual([{ kind: "spec", approvedBy: "owner", commitSha: SHA_A }]);
  });

  it("rejects an approval for a different SHA than the gate covers", () => {
    const result = transition(runAt("spec_gate"), approve(SHA_B));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/gate covers/);
  });

  it("rejects an approval with no approver", () => {
    const result = transition(runAt("spec_gate"), { type: "approve", approvedBy: "", commitSha: SHA_A });
    expect(result.ok).toBe(false);
  });

  it("only accepts the new SHA after the gate moves", () => {
    const moved = apply(runAt("release_gate"), { type: "gate_sha_changed", commitSha: SHA_B });
    expect(moved.gate?.commitSha).toBe(SHA_B);
    expect(transition(moved, approve(SHA_A)).ok).toBe(false);
    expect(apply(moved, approve(SHA_B)).state).toBe("deploy");
  });

  it("keeps the gate unchanged when the SHA is unchanged", () => {
    const gate = openGate("spec", SHA_A);
    expect(updateGateSha(gate, SHA_A)).toBe(gate);
  });

  it("clears the gate after leaving the gate state", () => {
    expect(apply(runAt("spec_gate"), approve()).gate).toBeNull();
  });

  it("records one approval per gate on the happy path", () => {
    expect(runAt("done").approvals.map((a) => a.kind)).toEqual(["spec", "design", "release"]);
  });

  it("does not record an approval when changes are requested", () => {
    expect(apply(runAt("spec_gate"), { type: "request_changes" }).approvals).toEqual([]);
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
