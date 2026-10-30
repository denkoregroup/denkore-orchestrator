/**
 * @jest-environment node
 */
import { RUN_STATES, TERMINAL_STATES, type RunState } from "@/lib/state-machine";
import type { StepName } from "@/lib/step-runner/types";
import { decide, REASONS } from "../decide";
import { LIMITS } from "../limits";
import type { ConductorAction, GateSnapshot, RunSnapshot, StepSnapshot } from "../types";

const RUN = "6f1c2b9e-4a3d-4c1e-9b7a-2d5e8f0a1b3c";
const ENTERED = "2026-10-30T10:00:00.000Z";
const BEFORE = "2026-10-30T09:00:00.000Z";
const AFTER = "2026-10-30T10:05:00.000Z";
const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);

function step(name: StepName, overrides: Partial<StepSnapshot> = {}): StepSnapshot {
  return {
    step: name,
    attempt: 1,
    stepKey: `${RUN}:${name}:1`,
    status: "succeeded",
    commitSha: SHA_A,
    prUrl: "https://example.com/pr/1",
    costUsd: 0.05,
    dispatchedAt: AFTER,
    ...overrides,
  };
}

function gate(kind: GateSnapshot["kind"], overrides: Partial<GateSnapshot> = {}): GateSnapshot {
  return { id: `gate-${kind}`, kind, commitSha: SHA_A, status: "pending", latestDecision: null, ...overrides };
}

function snap(state: RunState, overrides: Partial<RunSnapshot> = {}): RunSnapshot {
  return {
    runId: RUN,
    state,
    stateEnteredAt: ENTERED,
    testFailures: 0,
    maxTestRetries: 3,
    prompt: "Build the booking page",
    registryId: "example-app",
    steps: [],
    gates: [],
    totalCostUsd: 0,
    ...overrides,
  };
}

const approved = (sha = SHA_A) =>
  ({ decision: "approve", commitSha: sha, approvedBy: "owner-id", note: null, createdAt: AFTER }) as const;
const changes = (note: string | null, createdAt = AFTER, sha = SHA_A) =>
  ({ decision: "request_changes", commitSha: sha, approvedBy: "owner-id", note, createdAt }) as const;

type Case = [string, RunSnapshot, ConductorAction | ((a: ConductorAction) => void)];

const cases: Case[] = [
  // queued
  ["queued starts the run", snap("queued"), { type: "transition", event: { type: "start" } }],

  // dispatch on entering a work state (no step yet, or only steps from an earlier visit)
  ...(["spec", "design", "build_test", "verify", "deploy", "post_deploy_check"] as const).map(
    (name): Case => [`${name} with no step dispatches it`, snap(name), { type: "dispatch", step: name, attempt: 1, ownerNote: null }],
  ),
  [
    "build_test after a failed attempt from the previous visit dispatches attempt 2",
    snap("build_test", { steps: [step("build_test", { status: "failed", dispatchedAt: BEFORE })] }),
    { type: "dispatch", step: "build_test", attempt: 2, ownerNote: null },
  ],

  // waiting on a dispatched step
  ...(["spec", "design", "build_test", "verify", "deploy", "post_deploy_check"] as const).map(
    (name): Case => [`${name} waits while its step is dispatched`, snap(name, { steps: [step(name, { status: "dispatched" })] }), (a) => expect(a.type).toBe("wait")],
  ),

  // succeeded
  ["spec succeeded -> spec_ready(sha)", snap("spec", { steps: [step("spec")] }), { type: "transition", event: { type: "spec_ready", commitSha: SHA_A } }],
  ["design succeeded -> design_ready(sha)", snap("design", { steps: [step("design")] }), { type: "transition", event: { type: "design_ready", commitSha: SHA_A } }],
  ["build_test succeeded -> tests_passed", snap("build_test", { steps: [step("build_test")] }), { type: "transition", event: { type: "tests_passed" } }],
  ["build_test succeeded with only a PR -> tests_passed", snap("build_test", { steps: [step("build_test", { commitSha: null })] }), { type: "transition", event: { type: "tests_passed" } }],
  ["verify succeeded -> verify_passed(sha)", snap("verify", { steps: [step("verify")] }), { type: "transition", event: { type: "verify_passed", commitSha: SHA_A } }],
  ["deploy succeeded -> deployed", snap("deploy", { steps: [step("deploy")] }), { type: "transition", event: { type: "deployed" } }],
  ["post_deploy_check succeeded -> check_passed", snap("post_deploy_check", { steps: [step("post_deploy_check")] }), { type: "transition", event: { type: "check_passed" } }],

  // failed
  ["spec failed escalates", snap("spec", { steps: [step("spec", { status: "failed" })] }), { type: "escalate", reason: REASONS.stepFailed("spec") }],
  ["design failed escalates", snap("design", { steps: [step("design", { status: "failed" })] }), { type: "escalate", reason: REASONS.stepFailed("design") }],
  ["build_test failed -> tests_failed", snap("build_test", { steps: [step("build_test", { status: "failed" })] }), { type: "transition", event: { type: "tests_failed" } }],
  ["verify failed -> verify_failed", snap("verify", { steps: [step("verify", { status: "failed" })] }), { type: "transition", event: { type: "verify_failed" } }],
  ["deploy failed escalates", snap("deploy", { steps: [step("deploy", { status: "failed" })] }), { type: "escalate", reason: REASONS.stepFailed("deploy") }],
  ["post_deploy_check failed -> check_failed", snap("post_deploy_check", { steps: [step("post_deploy_check", { status: "failed" })] }), { type: "transition", event: { type: "check_failed" } }],

  // succeeded with nothing to show counts as failed
  ...(
    [
      ["spec", { type: "escalate", reason: REASONS.noCommit("spec") }],
      ["design", { type: "escalate", reason: REASONS.noCommit("design") }],
      ["build_test", { type: "transition", event: { type: "tests_failed" } }],
      ["verify", { type: "transition", event: { type: "verify_failed" } }],
      ["deploy", { type: "escalate", reason: REASONS.stepFailed("deploy") }],
      ["post_deploy_check", { type: "transition", event: { type: "check_failed" } }],
    ] as const
  ).map(
    ([name, expected]): Case => [
      `${name} succeeded with no commit and no PR is treated as failed`,
      snap(name, { steps: [step(name, { commitSha: null, prUrl: null })] }),
      expected,
    ],
  ),
  ["verify succeeded with only a PR is treated as failed (nothing to review)", snap("verify", { steps: [step("verify", { commitSha: null })] }), { type: "transition", event: { type: "verify_failed" } }],

  // gates: opening and moving
  ["spec_gate with no gate opens it at the plan's SHA", snap("spec_gate", { steps: [step("spec")] }), { type: "open_gate", kind: "spec", sha: SHA_A }],
  ["design_gate with no gate opens it", snap("design_gate", { steps: [step("design")] }), { type: "open_gate", kind: "design", sha: SHA_A }],
  ["release_gate opens at the verify step's SHA", snap("release_gate", { steps: [step("verify", { commitSha: SHA_B })] }), { type: "open_gate", kind: "release", sha: SHA_B }],
  [
    "release_gate re-entered with a new SHA moves the gate",
    snap("release_gate", { steps: [step("verify", { commitSha: SHA_B })], gates: [gate("release", { status: "changes_requested", latestDecision: changes("x", BEFORE) })] }),
    { type: "move_gate", gateId: "gate-release", fromSha: SHA_A, sha: SHA_B },
  ],
  ["gate with no source commit escalates", snap("spec_gate"), { type: "escalate", reason: REASONS.noReviewCommit }],

  // gates: decisions
  ["pending gate waits", snap("spec_gate", { steps: [step("spec")], gates: [gate("spec")] }), (a) => expect(a.type).toBe("wait")],
  [
    "approved gate for the current SHA -> approve with approver and SHA from the approval row",
    snap("spec_gate", { steps: [step("spec")], gates: [gate("spec", { status: "approved", latestDecision: approved() })] }),
    { type: "transition", event: { type: "approve", approvedBy: "owner-id", commitSha: SHA_A } },
  ],
  [
    "approval for a SHA the gate no longer covers is not applied",
    snap("spec_gate", { steps: [step("spec")], gates: [gate("spec", { status: "approved", latestDecision: approved(SHA_B) })] }),
    (a) => expect(a.type).toBe("wait"),
  ],
  [
    "changes requested -> request_changes",
    snap("design_gate", { steps: [step("design")], gates: [gate("design", { status: "changes_requested", latestDecision: changes("Bigger buttons") })] }),
    { type: "transition", event: { type: "request_changes" } },
  ],
  [
    "a changes request older than this visit to the gate means the same SHA came back: escalate",
    snap("spec_gate", { steps: [step("spec")], gates: [gate("spec", { status: "changes_requested", latestDecision: changes(null, BEFORE) })] }),
    { type: "escalate", reason: REASONS.noChange("spec") },
  ],

  // same SHA re-entry, caught when the step finishes
  ...(
    [
      ["spec", "spec"],
      ["design", "design"],
      ["verify", "release"],
    ] as const
  ).map(
    ([name, kind]): Case => [
      `${name} producing the SHA that was sent back escalates "no change was produced"`,
      snap(name, { steps: [step(name)], gates: [gate(kind, { status: "changes_requested", latestDecision: changes("x", BEFORE) })] }),
      { type: "escalate", reason: REASONS.noChange(name) },
    ],
  ),

  // owner notes go into the next dispatch
  [
    "spec redo carries the owner's note",
    snap("spec", { steps: [step("spec", { dispatchedAt: BEFORE })], gates: [gate("spec", { status: "changes_requested", latestDecision: changes("Add a staff view") })] }),
    { type: "dispatch", step: "spec", attempt: 2, ownerNote: "Add a staff view" },
  ],
  [
    "build_test after a release-gate change request carries the note",
    snap("build_test", { steps: [step("build_test", { dispatchedAt: BEFORE })], gates: [gate("release", { status: "changes_requested", latestDecision: changes("Fix the footer") })] }),
    { type: "dispatch", step: "build_test", attempt: 2, ownerNote: "Fix the footer" },
  ],
  [
    "no note once the gate is no longer changes_requested",
    snap("spec", { gates: [gate("spec", { status: "pending", latestDecision: changes("old note") })] }),
    { type: "dispatch", step: "spec", attempt: 1, ownerNote: null },
  ],

  // caps
  ["more than the step cap escalates", snap("build_test", { steps: Array.from({ length: LIMITS.maxStepsPerRun + 1 }, () => step("build_test", { dispatchedAt: BEFORE })) }), { type: "escalate", reason: REASONS.tooManySteps }],
  ["a dispatch that would exceed the step cap escalates", snap("build_test", { steps: Array.from({ length: LIMITS.maxStepsPerRun }, () => step("build_test", { dispatchedAt: BEFORE })) }), { type: "escalate", reason: REASONS.tooManySteps }],
  ["cost above the cap escalates", snap("spec_gate", { totalCostUsd: LIMITS.maxCostUsd + 0.01 }), { type: "escalate", reason: REASONS.tooExpensive }],
  ["cost exactly at the cap does not escalate", snap("queued", { totalCostUsd: LIMITS.maxCostUsd }), { type: "transition", event: { type: "start" } }],
];

describe("decide", () => {
  it.each(cases)("%s", (_name, snapshot, expected) => {
    const action = decide(snapshot);
    if (typeof expected === "function") expected(action);
    else expect(action).toEqual(expected);
  });

  it.each([...TERMINAL_STATES])("terminal %s waits, even over the caps", (state) => {
    expect(decide(snap(state, { totalCostUsd: 999 })).type).toBe("wait");
  });

  it("has a case for every run state", () => {
    const covered = new Set(cases.map(([, s]) => s.state));
    for (const state of RUN_STATES) {
      if (!(TERMINAL_STATES as readonly RunState[]).includes(state)) expect(covered).toContain(state);
    }
  });

  it("treats timestamps in different ISO shapes as the same instant", () => {
    const s = snap("spec", { stateEnteredAt: "2026-10-30T10:00:00.000+00:00", steps: [step("spec", { status: "dispatched", dispatchedAt: "2026-10-30T10:00:00Z" })] });
    expect(decide(s).type).toBe("wait");
  });
});
