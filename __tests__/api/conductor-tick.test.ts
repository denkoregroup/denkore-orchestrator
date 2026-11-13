/**
 * @jest-environment node
 */
import { advanceRun, type ConductorDeps } from "@/lib/conductor/advance";
import { STEP_DEADLINE_SECONDS } from "@/lib/conductor/decide";
import { LIMITS } from "@/lib/conductor/limits";
import { MemoryConductorStore } from "@/lib/conductor/memory-store";
import { createTickHandler } from "@/lib/conductor/tick";
import { loadRegistry } from "@/lib/registry/loader";
import { GitHubActionsRunner } from "@/lib/step-runner/github-actions";
import { sign, SIGNATURE_HEADER } from "@/lib/webhooks/signature";
import { EXAMPLE_REGISTRY_DIR } from "@/test-utils/registry";
import { quietWatchdog } from "@/test-utils/watchdog";

const SECRET = "test-secret-not-real";

function request(body: string, signature: string | null) {
  const headers = new Headers({ "content-type": "application/json" });
  if (signature !== null) headers.set(SIGNATURE_HEADER, signature);
  return new Request("http://localhost/api/conductor/tick", { method: "POST", headers, body });
}

async function memoryTick() {
  const registry = await loadRegistry(EXAMPLE_REGISTRY_DIR);
  const store = new MemoryConductorStore();
  const deps: ConductorDeps = {
    store,
    now: store.now,
    registryEntry: async (id) => registry.get(id),
    runnerFor: ({ attempt, entry }) => new GitHubActionsRunner({ repo: entry.repo, workflow: "step.yml", attempt }),
  };
  const advanced: string[] = [];
  const handler = createTickHandler({
    secret: SECRET,
    listActiveRunIds: (limit) => store.listActiveRunIds(limit),
    advance: (runId) => {
      advanced.push(runId);
      return advanceRun(runId, deps);
    },
    watchdog: quietWatchdog,
  });
  return { store, deps, handler, advanced };
}

describe("POST /api/conductor/tick (handler)", () => {
  it("rejects a bad or missing signature without touching any run", async () => {
    const t = await memoryTick();
    const id = t.store.addRun();
    for (const sig of [null, sign("{}", "wrong-secret"), sign("{}", SECRET).slice(0, -1)]) {
      const res = await t.handler(request("{}", sig));
      expect(res.status).toBe(401);
    }
    expect(t.advanced).toHaveLength(0);
    expect(t.store.runs.get(id)!.state).toBe("queued");
  });

  it("refuses to run without a configured secret", async () => {
    const handler = createTickHandler({ secret: undefined, listActiveRunIds: jest.fn(), advance: jest.fn(), watchdog: jest.fn() });
    expect((await handler(request("{}", sign("{}", "")))).status).toBe(500);
  });

  it("advances only non-terminal runs, longest-waiting first", async () => {
    const t = await memoryTick();
    const queued = t.store.addRun();
    const done = t.store.addRun({ state: "done" });
    const escalated = t.store.addRun({ state: "escalated" });
    const cancelled = t.store.addRun({ state: "cancelled" });
    const failed = t.store.addRun({ state: "failed" });
    const waiting = t.store.addRun({ state: "spec" });

    const res = await t.handler(request("{}", sign("{}", SECRET)));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.checked).toBe(2);
    // The queued run started; the spec run dispatched its step. Nothing had hung.
    expect(body).toMatchObject({ advanced: 2, stepsTimedOut: 0 });
    expect(t.advanced).toEqual([queued, waiting]);
    expect(t.store.runs.get(queued)!.state).toBe("spec");
    for (const id of [done, escalated, cancelled, failed]) {
      expect(t.store.events.filter((e) => e.runId === id)).toHaveLength(0);
    }
  });

  it("handles the longest-waiting runs first when there are more than the batch size", async () => {
    const t = await memoryTick();
    const total = LIMITS.tickBatchSize + 10;
    const ids = Array.from({ length: total }, () => t.store.addRun());
    // Waiting order differs from creation order: run i last changed (i * 8) mod total minutes ago.
    // 8 and 35 share no factor, so every run gets a different age.
    const minutesAgo = new Map(ids.map((id, i) => [id, (i * 8) % total]));
    expect(new Set(minutesAgo.values()).size).toBe(total);
    for (const id of ids) {
      t.store.runs.get(id)!.updatedAt = new Date(Date.parse("2026-10-30T12:00:00.000Z") - minutesAgo.get(id)! * 60_000).toISOString();
    }
    t.store.addRun({ state: "done" });

    const body = await (await t.handler(request("{}", sign("{}", SECRET)))).json();
    const longestWaiting = [...ids].sort((a, b) => minutesAgo.get(b)! - minutesAgo.get(a)!).slice(0, LIMITS.tickBatchSize);
    expect(body.checked).toBe(LIMITS.tickBatchSize);
    expect(t.advanced).toEqual(longestWaiting);
    expect(t.advanced).not.toEqual(ids.slice(0, LIMITS.tickBatchSize));
  });

  it("breaks updated_at ties by id, so the order is always the same", async () => {
    const t = await memoryTick();
    const ids = Array.from({ length: 5 }, () => t.store.addRun());
    for (const id of ids) t.store.runs.get(id)!.updatedAt = "2026-10-30T12:00:00.000Z";
    expect(await t.store.listActiveRunIds(5)).toEqual([...ids].sort());
  });

  it("stops at the batch size", async () => {
    const t = await memoryTick();
    for (let i = 0; i < LIMITS.tickBatchSize + 5; i++) t.store.addRun();
    const body = await (await t.handler(request("{}", sign("{}", SECRET)))).json();
    expect(body.checked).toBe(LIMITS.tickBatchSize);
  });

  it("reports how many runs moved and how many hung steps it timed out", async () => {
    const t = await memoryTick();
    const hung = t.store.addRun({ state: "build_test" });
    await advanceRun(hung, t.deps); // dispatches a build step that will never report back
    t.store.advanceClock(STEP_DEADLINE_SECONDS + 1);
    const fresh = t.store.addRun({ state: "build_test" });
    await advanceRun(fresh, t.deps); // dispatched just now: inside its deadline

    const body = await (await t.handler(request("{}", sign("{}", SECRET)))).json();
    // hung: timed out and retried (advanced); fresh: nothing to do yet.
    expect(body).toMatchObject({ checked: 2, advanced: 1, stepsTimedOut: 1 });
    expect(t.store.latestStep(hung)).toMatchObject({ attempt: 2, status: "dispatched" });
  });

  it("advances the runs first, then fails loudly if the watchdog cannot run", async () => {
    const advance = jest.fn(async (id: string) => ({ runId: id, applied: [], stopped: "waiting" as const }));
    const handler = createTickHandler({
      secret: SECRET,
      listActiveRunIds: async () => ["a"],
      advance,
      watchdog: async () => {
        throw new Error("site watchdog store: project lookup failed: database down");
      },
    });
    await expect(handler(request("{}", sign("{}", SECRET)))).rejects.toThrow(/database down/);
    expect(advance).toHaveBeenCalledWith("a"); // the Conductor's work was done before the watchdog failed
  });

  it("keeps going when one run fails", async () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    const handler = createTickHandler({
      secret: SECRET,
      listActiveRunIds: async () => ["a", "b"],
      advance: async (id) => {
        if (id === "a") throw new Error("boom");
        return { runId: id, applied: [], stopped: "waiting" };
      },
      watchdog: quietWatchdog,
    });
    const body = await (await handler(request("{}", sign("{}", SECRET)))).json();
    expect(body.runs).toEqual([
      { runId: "a", stopped: "error" },
      { runId: "b", stopped: "waiting" },
    ]);
    error.mockRestore();
  });
});

describe("POST /api/conductor/tick (route)", () => {
  const advance = jest.fn();
  const listActiveRunIds = jest.fn();
  const watchedSites = jest.fn();
  beforeAll(() => {
    process.env.STEP_WEBHOOK_SECRET = SECRET;
    jest.doMock("@/lib/conductor/advance", () => ({ advanceRun: (id: string) => advance(id) }));
    jest.doMock("@/lib/conductor/supabase-store", () => ({
      SupabaseConductorStore: jest.fn(() => ({ listActiveRunIds })),
    }));
    jest.doMock("@/lib/site-health/supabase-watchdog-store", () => ({
      SupabaseWatchdogStore: jest.fn(() => ({ watchedSites, escalate: jest.fn() })),
    }));
  });

  it("uses the webhook secret and advances the listed runs", async () => {
    watchedSites.mockResolvedValue([]); // none of the registered sites has a project row: the watchdog says so, and the runs still advance
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    listActiveRunIds.mockResolvedValue(["run-1"]);
    advance.mockResolvedValue({ runId: "run-1", applied: [], stopped: "waiting" });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { POST } = require("@/app/api/conductor/tick/route") as typeof import("@/app/api/conductor/tick/route");

    expect((await POST(request("{}", sign("{}", "nope")))).status).toBe(401);
    expect(advance).not.toHaveBeenCalled();

    const res = await POST(request("{}", sign("{}", SECRET)));
    expect(res.status).toBe(200);
    expect(listActiveRunIds).toHaveBeenCalledWith(LIMITS.tickBatchSize);
    expect(advance).toHaveBeenCalledWith("run-1");
    expect((await res.json()).watchdog.unsynced).toEqual(["dclarkdev-com", "denkore-com", "ggrmusic-com"]);
    expect(error).toHaveBeenCalledWith(expect.stringContaining("run pnpm registry:sync"));
    error.mockRestore();
  });

  it("runs the site watchdog for the registered sites, and puts its result in the answer", async () => {
    listActiveRunIds.mockResolvedValue([]);
    // Three sites registered; one has had a report this minute, one never has (registered long ago), one is 3 days stale.
    const now = Date.now();
    watchedSites.mockResolvedValue([
      { registryId: "dclarkdev-com", registeredAt: new Date(now - 30 * 864e5).toISOString(), lastReportAt: new Date(now - 60e3).toISOString() },
      { registryId: "denkore-com", registeredAt: new Date(now - 30 * 864e5).toISOString(), lastReportAt: null },
      { registryId: "ggrmusic-com", registeredAt: new Date(now - 30 * 864e5).toISOString(), lastReportAt: new Date(now - 3 * 864e5).toISOString() },
    ]);
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { POST } = require("@/app/api/conductor/tick/route") as typeof import("@/app/api/conductor/tick/route");
    const res = await POST(request("{}", sign("{}", SECRET)));
    expect(res.status).toBe(200);
    // The registered sites are the registry entries with an audits block.
    expect(watchedSites).toHaveBeenCalledWith(["dclarkdev-com", "denkore-com", "ggrmusic-com"]);
    expect((await res.json()).watchdog).toMatchObject({
      sitesChecked: 3,
      overdue: ["denkore-com", "ggrmusic-com"],
      unsynced: [],
    });
  });
});
