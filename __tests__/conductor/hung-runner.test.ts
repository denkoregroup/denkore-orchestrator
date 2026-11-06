/**
 * @jest-environment node
 *
 * End to end without a database: the simulator's payloads, signed the way
 * `pnpm conductor:simulate` signs them, go through the real step-complete
 * webhook handler into the in-memory store, and the Conductor reacts exactly
 * as the route's onRecorded trigger makes it. The build step then never
 * reports back; the clock moves past each deadline and the tick advances it.
 * Set PRINT_TRANSCRIPT=1 to see the run's history.
 */
import path from "node:path";
import { advanceRun, ESCALATION_REASONS, type ConductorDeps } from "@/lib/conductor/advance";
import { STEP_DEADLINE_SECONDS } from "@/lib/conductor/decide";
import { MemoryConductorStore } from "@/lib/conductor/memory-store";
import { buildSimulatedCompletion, type SimulatedStep } from "@/lib/conductor/simulate";
import { createTickHandler } from "@/lib/conductor/tick";
import { loadRegistry } from "@/lib/registry/loader";
import { eventDescription } from "@/lib/runs/labels";
import { GitHubActionsRunner } from "@/lib/step-runner/github-actions";
import { sign, SIGNATURE_HEADER } from "@/lib/webhooks/signature";
import { createStepCompleteHandler } from "@/lib/webhooks/step-complete";

const SECRET = "test-secret-not-real";

it("a run whose build step never completes times out, retries, then escalates", async () => {
  const registry = await loadRegistry(path.join(process.cwd(), "registry"));
  const store = new MemoryConductorStore();
  const deps: ConductorDeps = {
    store,
    now: store.now,
    registryEntry: async (id) => registry.get(id),
    runnerFor: ({ attempt, entry }) => new GitHubActionsRunner({ repo: entry.repo, workflow: "step.yml", attempt }),
  };
  const advance = (runId: string) => advanceRun(runId, deps);

  const webhook = createStepCompleteHandler({
    secret: SECRET,
    store: () => ({
      record: async (payload) =>
        store.completeStep(payload.stepKey, {
          status: payload.output.status,
          commitSha: payload.output.commitSha ?? null,
          prUrl: payload.output.prUrl ?? null,
          costUsd: payload.output.costUsd,
        })
          ? "recorded"
          : "duplicate",
    }),
    onRecorded: () => {},
  });
  const tick = createTickHandler({ secret: SECRET, listActiveRunIds: (n) => store.listActiveRunIds(n), advance });
  const signed = (url: string, body: string) =>
    new Request(url, { method: "POST", headers: { [SIGNATURE_HEADER]: sign(body, SECRET) }, body });

  /** What `pnpm conductor:simulate --run <id> --step <step>` sends, then the onRecorded advance. */
  async function simulate(runId: string, step: SimulatedStep) {
    const attempt = store.latestStep(runId).attempt;
    const body = JSON.stringify(buildSimulatedCompletion({ runId, step, attempt, fail: false }));
    const res = await webhook(signed("http://localhost/api/webhooks/step-complete", body));
    expect(await res.json()).toMatchObject({ status: "recorded" });
    await advance(runId);
  }
  async function approve(runId: string, kind: "spec" | "design") {
    const gate = store.gateFor(runId, kind)!;
    store.decide(gate.id, "approve", gate.commitSha);
    await advance(runId);
  }

  const id = store.addRun({ maxTestRetries: 2 });
  await advance(id);
  await simulate(id, "spec");
  await approve(id, "spec");
  await simulate(id, "design");
  await approve(id, "design");
  expect(store.runs.get(id)!.state).toBe("build_test");

  // The runner never reports back. Each time the deadline passes, the tick runs.
  for (let i = 0; i < 5 && store.runs.get(id)!.state !== "escalated"; i++) {
    store.advanceClock(STEP_DEADLINE_SECONDS + 1);
    const res = await tick(signed("http://localhost/api/conductor/tick", "{}"));
    expect(res.status).toBe(200);
  }

  const history = store.events.filter((e) => e.runId === id).map((e) => eventDescription(e.kind, e.payload));
  if (process.env.PRINT_TRANSCRIPT) process.stdout.write(`\n${history.map((h, i) => `${String(i + 1).padStart(2)}. ${h}`).join("\n")}\n`);

  const builds = store.steps.filter((s) => s.runId === id && s.step === "build_test");
  expect(builds.map((s) => [s.attempt, s.status])).toEqual([
    [1, "failed"],
    [2, "failed"],
    [3, "failed"],
  ]);
  expect(store.events.filter((e) => e.kind === "conductor.step_timed_out")).toHaveLength(3);
  expect(store.runs.get(id)!.state).toBe("escalated");
  expect(history.at(-1)).toBe(`Needs your attention: ${ESCALATION_REASONS.keptTimingOut(2)}`);
});
