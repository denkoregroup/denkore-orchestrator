/**
 * @jest-environment node
 */
import path from "node:path";
import { loadRegistry } from "@/lib/registry/loader";
import type { RegistryEntry } from "@/lib/registry/schema";
import type { GateKind } from "@/lib/state-machine";
import { GitHubActionsRunner } from "@/lib/step-runner/github-actions";
import type { StepInput } from "@/lib/step-runner/types";
import { advanceRun, ESCALATION_REASONS, type ConductorDeps } from "../advance";
import { REASONS } from "../decide";
import { LIMITS } from "../limits";
import { MemoryConductorStore } from "../memory-store";

let registry: Map<string, RegistryEntry>;
beforeAll(async () => {
  registry = await loadRegistry(path.join(process.cwd(), "registry"));
});

const sha = (n: number) => n.toString(16).padStart(40, "0");

function setup(options: { runnerThrows?: boolean } = {}) {
  const store = new MemoryConductorStore();
  const dispatched: StepInput[] = [];
  const deps: ConductorDeps = {
    store,
    now: store.now,
    registryEntry: async (id) => registry.get(id),
    runnerFor: ({ attempt, entry }) => {
      const runner = new GitHubActionsRunner({ repo: entry.repo, workflow: "step.yml", attempt });
      return {
        name: runner.name,
        dispatch: async (input) => {
          if (options.runnerThrows) throw new Error("runner unavailable");
          dispatched.push(input);
          return runner.dispatch(input);
        },
      };
    },
  };
  const advance = (runId: string) => advanceRun(runId, deps);
  const state = (runId: string) => store.runs.get(runId)!.state;

  /** Completes the newest step (as the webhook would) and lets the Conductor react. */
  async function complete(runId: string, output: { status?: "succeeded" | "failed"; commitSha?: string | null; prUrl?: string | null; costUsd?: number } = {}) {
    const step = store.latestStep(runId);
    expect(step.status).toBe("dispatched");
    store.completeStep(step.stepKey, {
      status: output.status ?? "succeeded",
      commitSha: output.commitSha === undefined ? sha(step.attempt * 100 + dispatchedCount()) : output.commitSha,
      prUrl: output.prUrl === undefined ? "https://example.com/pr/1" : output.prUrl,
      costUsd: output.costUsd ?? 0.05,
    });
    return advance(runId);
  }
  const dispatchedCount = () => dispatched.length;

  /** The owner decides the open gate at whatever SHA it shows (as the approvals page would). */
  async function ownerDecides(runId: string, kind: GateKind, decision: "approve" | "request_changes", note: string | null = null) {
    const gate = store.gateFor(runId, kind)!;
    store.decide(gate.id, decision, gate.commitSha, note);
    return advance(runId);
  }

  return { store, deps, dispatched, advance, state, complete, ownerDecides };
}

describe("advanceRun: happy path", () => {
  it("drives a run from queued to done with completions and approvals", async () => {
    const t = setup();
    const id = t.store.addRun();

    expect((await t.advance(id)).stopped).toBe("waiting");
    expect(t.state(id)).toBe("spec");
    expect(t.dispatched.map((d) => d.step)).toEqual(["spec"]);

    await t.complete(id);
    expect(t.state(id)).toBe("spec_gate");
    const specGate = t.store.gateFor(id, "spec")!;
    expect(specGate.commitSha).toBe(t.store.latestStep(id).commitSha);
    expect(specGate.status).toBe("pending");

    await t.ownerDecides(id, "spec", "approve");
    expect(t.state(id)).toBe("design");

    await t.complete(id);
    expect(t.state(id)).toBe("design_gate");
    await t.ownerDecides(id, "design", "approve");
    expect(t.state(id)).toBe("build_test");

    await t.complete(id);
    expect(t.state(id)).toBe("verify");

    await t.complete(id);
    expect(t.state(id)).toBe("release_gate");
    expect(t.store.gateFor(id, "release")!.commitSha).toBe(t.store.latestStep(id).commitSha);
    await t.ownerDecides(id, "release", "approve");
    expect(t.state(id)).toBe("deploy");

    await t.complete(id);
    expect(t.state(id)).toBe("post_deploy_check");
    const last = await t.complete(id);
    expect(t.state(id)).toBe("done");
    expect(last.stopped).toBe("waiting");

    expect(t.dispatched.map((d) => d.step)).toEqual(["spec", "design", "build_test", "verify", "deploy", "post_deploy_check"]);
    expect(t.dispatched.every((d) => d.branch === `cast/${id.slice(0, 8)}`)).toBe(true);
    expect(t.store.events.filter((e) => e.kind === "conductor.escalated")).toHaveLength(0);
  });

  it("does nothing more once the run is done", async () => {
    const t = setup();
    const id = t.store.addRun({ state: "done" });
    const result = await t.advance(id);
    expect(result).toMatchObject({ stopped: "waiting", applied: [] });
  });

  it("reports a run that does not exist", async () => {
    const t = setup();
    expect((await t.advance("6f1c2b9e-4a3d-4c1e-9b7a-2d5e8f0a1b3c")).stopped).toBe("not_found");
  });
});

describe("advanceRun: request changes", () => {
  it("returns to the earlier step and puts the owner's note in the next dispatch", async () => {
    const t = setup();
    const id = t.store.addRun();
    await t.advance(id);
    await t.complete(id, { commitSha: sha(1) });
    await t.ownerDecides(id, "spec", "request_changes", "Add a staff view");

    expect(t.state(id)).toBe("spec");
    const redo = t.dispatched.at(-1)!;
    expect(redo.step).toBe("spec");
    expect(redo.task).toContain("Add a staff view");
    expect(t.store.latestStep(id).attempt).toBe(2);

    // A new commit moves the gate, which reopens it for review.
    await t.complete(id, { commitSha: sha(2) });
    expect(t.state(id)).toBe("spec_gate");
    const gate = t.store.gateFor(id, "spec")!;
    expect(gate).toMatchObject({ commitSha: sha(2), status: "pending" });

    await t.ownerDecides(id, "spec", "approve");
    expect(t.state(id)).toBe("design");
    expect(t.dispatched.at(-1)!.task).not.toContain("Add a staff view");
  });

  it("sends the release gate's note to the next build", async () => {
    const t = setup();
    const id = t.store.addRun();
    await t.advance(id);
    await t.complete(id);
    await t.ownerDecides(id, "spec", "approve");
    await t.complete(id);
    await t.ownerDecides(id, "design", "approve");
    await t.complete(id); // build_test
    await t.complete(id); // verify
    await t.ownerDecides(id, "release", "request_changes", "The footer overlaps on phones");
    expect(t.state(id)).toBe("build_test");
    expect(t.dispatched.at(-1)).toMatchObject({ step: "build_test" });
    expect(t.dispatched.at(-1)!.task).toContain("The footer overlaps on phones");
  });

  it("escalates when the redo produces the same SHA", async () => {
    const t = setup();
    const id = t.store.addRun();
    await t.advance(id);
    await t.complete(id, { commitSha: sha(1) });
    await t.ownerDecides(id, "spec", "request_changes", "More detail");
    const result = await t.complete(id, { commitSha: sha(1) });

    expect(t.state(id)).toBe("escalated");
    expect(result).toMatchObject({ stopped: "escalated", reason: REASONS.noChange("spec") });
    expect(t.store.events.find((e) => e.kind === "conductor.escalated")?.payload.reason).toBe(REASONS.noChange("spec"));
  });
});

describe("advanceRun: stale approvals", () => {
  it("does not apply an approval once the gate has moved to a new SHA", async () => {
    const t = setup();
    const id = t.store.addRun();
    await t.advance(id);
    await t.complete(id, { commitSha: sha(1) });
    const gate = t.store.gateFor(id, "spec")!;
    t.store.decide(gate.id, "approve", sha(1));
    // The gate moves before the Conductor sees the approval; the database resets it to pending.
    t.store.setGateSha(gate, sha(9));

    const result = await t.advance(id);
    expect(t.state(id)).toBe("spec_gate");
    expect(result.stopped).not.toBe("escalated");
    expect(t.store.runs.get(id)!.state).not.toBe("design");
  });

  it("the database refuses an approval for a SHA the gate no longer covers", async () => {
    const t = setup();
    const id = t.store.addRun();
    await t.advance(id);
    await t.complete(id, { commitSha: sha(1) });
    const gate = t.store.gateFor(id, "spec")!;
    expect(() => t.store.decide(gate.id, "approve", sha(2))).toThrow(/gate now covers/);
  });
});

describe("advanceRun: caps", () => {
  it("escalates when tests keep failing past the retry cap", async () => {
    const t = setup();
    const id = t.store.addRun({ maxTestRetries: 1 });
    await t.advance(id);
    await t.complete(id);
    await t.ownerDecides(id, "spec", "approve");
    await t.complete(id);
    await t.ownerDecides(id, "design", "approve");

    await t.complete(id, { status: "failed" });
    expect(t.state(id)).toBe("build_test");
    expect(t.store.latestStep(id)).toMatchObject({ step: "build_test", attempt: 2, status: "dispatched" });

    const result = await t.complete(id, { status: "failed" });
    expect(t.state(id)).toBe("escalated");
    expect(result.reason).toBe(ESCALATION_REASONS.testsKeptFailing(1));
  });

  it("escalates instead of dispatching more than the step cap", async () => {
    const t = setup();
    const id = t.store.addRun({ maxTestRetries: 100 });
    await t.advance(id);
    await t.complete(id);
    await t.ownerDecides(id, "spec", "approve");
    await t.complete(id);
    await t.ownerDecides(id, "design", "approve");
    let result = await t.complete(id, { status: "failed" });
    while (result.stopped === "waiting") result = await t.complete(id, { status: "failed" });

    expect(result).toMatchObject({ stopped: "escalated", reason: REASONS.tooManySteps });
    expect(t.store.steps.filter((s) => s.runId === id)).toHaveLength(LIMITS.maxStepsPerRun);
  });

  it("escalates when the run's cost passes the cap", async () => {
    const t = setup();
    const id = t.store.addRun();
    await t.advance(id);
    await t.complete(id, { costUsd: 10 });
    await t.ownerDecides(id, "spec", "approve");
    const result = await t.complete(id, { costUsd: 6 });
    expect(result).toMatchObject({ stopped: "escalated", reason: REASONS.tooExpensive });
  });
});

describe("advanceRun: failures", () => {
  it("logs and escalates when the runner can't take the step", async () => {
    const t = setup({ runnerThrows: true });
    const id = t.store.addRun();
    const result = await t.advance(id);

    expect(result).toMatchObject({ stopped: "escalated", reason: ESCALATION_REASONS.dispatchFailed });
    expect(t.store.latestStep(id).status).toBe("failed");
    expect(t.store.events.map((e) => e.kind)).toEqual(
      expect.arrayContaining(["conductor.dispatch_failed", "conductor.escalated"]),
    );
  });

  it("escalates a project that is not in the registry", async () => {
    const t = setup();
    const id = t.store.addRun({ registryId: "not-registered" });
    const result = await t.advance(id);
    expect(result).toMatchObject({ stopped: "escalated", reason: ESCALATION_REASONS.notInRegistry });
    expect(t.store.steps).toHaveLength(0);
  });
});

describe("advanceRun: concurrency", () => {
  it("two concurrent calls on a queued run apply exactly one transition and one dispatch", async () => {
    const t = setup();
    const id = t.store.addRun();
    const results = await Promise.all([t.advance(id), t.advance(id)]);

    const starts = t.store.events.filter((e) => e.kind === "run.state_changed" && e.payload.from === "queued");
    expect(starts).toHaveLength(1);
    expect(t.store.steps.filter((s) => s.runId === id)).toHaveLength(1);
    expect(t.dispatched).toHaveLength(1);
    expect(results.map((r) => r.stopped).sort()).toEqual(["raced", "waiting"]);
  });

  it("two concurrent calls after a failed build count the failure once", async () => {
    const t = setup();
    const id = t.store.addRun();
    await t.advance(id);
    await t.complete(id);
    await t.ownerDecides(id, "spec", "approve");
    await t.complete(id);
    await t.ownerDecides(id, "design", "approve");
    const step = t.store.latestStep(id);
    t.store.completeStep(step.stepKey, { status: "failed", commitSha: null, prUrl: "https://example.com/pr/1" });

    await Promise.all([t.advance(id), t.advance(id)]);
    expect(t.store.runs.get(id)!.testFailures).toBe(1);
    expect(t.store.steps.filter((s) => s.runId === id && s.step === "build_test")).toHaveLength(2);
  });

  it("a caller holding a stale snapshot cannot re-apply a transition another caller already made", async () => {
    const t = setup();
    const id = t.store.addRun();
    await t.advance(id);
    await t.complete(id);
    await t.ownerDecides(id, "spec", "approve");
    await t.complete(id);
    await t.ownerDecides(id, "design", "approve");
    const step = t.store.latestStep(id);
    t.store.completeStep(step.stepKey, { status: "failed", commitSha: null, prUrl: "https://example.com/pr/1" });

    // Caller B reads the run, then caller A does all the work before B continues.
    const stale = await t.store.loadSnapshot(id);
    await t.advance(id);
    expect(t.store.latestStep(id)).toMatchObject({ step: "build_test", attempt: 2, status: "dispatched" });

    let served = false;
    const staleStore = Object.create(t.store) as MemoryConductorStore;
    staleStore.loadSnapshot = async (runId: string) => {
      if (!served) {
        served = true;
        return stale;
      }
      return t.store.loadSnapshot(runId);
    };
    const result = await advanceRun(id, { ...t.deps, store: staleStore });

    // The state did not change, but the version (stateEnteredAt) did, so B's write is refused.
    expect(result.stopped).toBe("raced");
    expect(t.store.runs.get(id)!.testFailures).toBe(1);
    expect(t.store.steps.filter((s) => s.runId === id && s.step === "build_test")).toHaveLength(2);
  });

  it("two concurrent calls at a new gate open it once", async () => {
    const t = setup();
    const id = t.store.addRun();
    await t.advance(id);
    const step = t.store.latestStep(id);
    t.store.completeStep(step.stepKey, { status: "succeeded", commitSha: sha(1) });
    await Promise.all([t.advance(id), t.advance(id)]);
    expect(t.store.gates.filter((g) => g.runId === id)).toHaveLength(1);
    expect(t.state(id)).toBe("spec_gate");
  });
});
