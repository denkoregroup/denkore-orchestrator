/**
 * @jest-environment node
 */
import path from "node:path";
import { advanceRun, type ConductorDeps } from "@/lib/conductor/advance";
import { LIMITS } from "@/lib/conductor/limits";
import { MemoryConductorStore } from "@/lib/conductor/memory-store";
import { createTickHandler } from "@/lib/conductor/tick";
import { loadRegistry } from "@/lib/registry/loader";
import { GitHubActionsRunner } from "@/lib/step-runner/github-actions";
import { sign, SIGNATURE_HEADER } from "@/lib/webhooks/signature";

const SECRET = "test-secret-not-real";

function request(body: string, signature: string | null) {
  const headers = new Headers({ "content-type": "application/json" });
  if (signature !== null) headers.set(SIGNATURE_HEADER, signature);
  return new Request("http://localhost/api/conductor/tick", { method: "POST", headers, body });
}

async function memoryTick() {
  const registry = await loadRegistry(path.join(process.cwd(), "registry"));
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
  });
  return { store, handler, advanced };
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
    const handler = createTickHandler({ secret: undefined, listActiveRunIds: jest.fn(), advance: jest.fn() });
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

  it("keeps going when one run fails", async () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    const handler = createTickHandler({
      secret: SECRET,
      listActiveRunIds: async () => ["a", "b"],
      advance: async (id) => {
        if (id === "a") throw new Error("boom");
        return { runId: id, applied: [], stopped: "waiting" };
      },
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
  beforeAll(() => {
    process.env.STEP_WEBHOOK_SECRET = SECRET;
    jest.doMock("@/lib/conductor/advance", () => ({ advanceRun: (id: string) => advance(id) }));
    jest.doMock("@/lib/conductor/supabase-store", () => ({
      SupabaseConductorStore: jest.fn(() => ({ listActiveRunIds })),
    }));
  });

  it("uses the webhook secret and advances the listed runs", async () => {
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
  });
});
