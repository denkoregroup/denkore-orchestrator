/**
 * @jest-environment node
 */
import { createFakeSupabase, argsOf, type FakeQuery } from "@/test-utils/fake-supabase";

const requireOwner = jest.fn();
const createClient = jest.fn();

jest.mock("@/lib/auth", () => ({ requireOwner: () => requireOwner() }));
jest.mock("@/lib/supabase/server", () => ({ createClient: () => createClient() }));

import { listProjects } from "../projects";
import { createRun, getRun, listRuns } from "../runs";
import { getGateForDecision, insertApproval, listPendingGates } from "../gates";
import { EVENTS_PAGE_SIZE, listEvents } from "../events";

const RUN_ID = "6f1c2b9e-4a3d-4c1e-9b7a-2d5e8f0a1b3c";
const PROJECT_ID = "7a2d3c0f-5b4e-4d2f-8c8b-3e6f9a1b2c4d";
const GATE_ID = "8b3e4d1a-6c5f-4e3a-9d9c-4f7a0b2c3d5e";

const DATA_CALLS: Array<[string, () => Promise<unknown>]> = [
  ["listProjects", () => listProjects()],
  ["listRuns", () => listRuns()],
  ["getRun", () => getRun(RUN_ID)],
  ["listPendingGates", () => listPendingGates()],
  ["listEvents", () => listEvents()],
  ["createRun", () => createRun({ projectId: PROJECT_ID, prompt: "Build the booking page", maxTestRetries: 3 })],
  ["getGateForDecision", () => getGateForDecision(GATE_ID)],
  [
    "insertApproval",
    () => insertApproval({ gateId: GATE_ID, commitSha: "abcdef1", decision: "approve", note: null }),
  ],
];

beforeEach(() => {
  requireOwner.mockReset();
  createClient.mockReset();
});

describe("owner check comes first", () => {
  it.each(DATA_CALLS)("%s queries nothing when requireOwner throws", async (_name, call) => {
    const fake = createFakeSupabase();
    createClient.mockResolvedValue(fake.client);
    requireOwner.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(call()).rejects.toThrow("NEXT_REDIRECT");
    expect(createClient).not.toHaveBeenCalled();
    expect(fake.queries).toHaveLength(0);
  });
});

function withFake(respond: (q: FakeQuery) => { data: unknown; error: null | { message: string; code?: string } }) {
  const fake = createFakeSupabase(respond);
  requireOwner.mockResolvedValue({ id: "owner", email: null });
  createClient.mockResolvedValue(fake.client);
  return fake;
}

const run = {
  id: RUN_ID,
  project_id: PROJECT_ID,
  state: "queued",
  prompt: "Build the booking page",
  test_failures: 0,
  max_test_retries: 3,
  created_at: "2026-10-26T10:00:00Z",
  updated_at: "2026-10-26T10:00:00Z",
};
const project = { id: PROJECT_ID, registry_id: "example-app", repo: "denkoregroup/example-app", created_at: "x" };

describe("schema drift", () => {
  it("fails loudly on an unexpected row shape", async () => {
    withFake(() => ({ data: [{ ...run, state: "paused" }], error: null }));
    await expect(listRuns()).rejects.toThrow(/Unexpected runs row shape/);
  });
});

describe("listRuns", () => {
  it("sums step costs per run, including numeric strings", async () => {
    withFake((q) => {
      if (q.table === "runs") return { data: [run], error: null };
      if (q.table === "projects") return { data: [project], error: null };
      return {
        data: [
          { run_id: RUN_ID, cost_usd: 1.25 },
          { run_id: RUN_ID, cost_usd: "0.5000" },
          { run_id: RUN_ID, cost_usd: null },
        ],
        error: null,
      };
    });
    const [summary] = await listRuns();
    expect(summary.costUsd).toBeCloseTo(1.75);
    expect(summary.project?.registry_id).toBe("example-app");
  });
});

describe("getRun", () => {
  it("returns null for an id that is not a UUID without querying", async () => {
    const fake = withFake(() => ({ data: null, error: null }));
    expect(await getRun("not-a-uuid")).toBeNull();
    expect(fake.queries).toHaveLength(0);
  });
});

describe("listEvents", () => {
  it("returns a cursor when there are more than one page", async () => {
    const rows = Array.from({ length: EVENTS_PAGE_SIZE + 1 }, (_, i) => ({
      id: 1000 - i,
      run_id: null,
      kind: "run.created",
      payload: {},
      actor: "system",
      created_at: "x",
    }));
    const fake = withFake(() => ({ data: rows, error: null }));
    const page = await listEvents({ runId: RUN_ID, before: 2000 });
    expect(page.events).toHaveLength(EVENTS_PAGE_SIZE);
    expect(page.nextCursor).toBe(1000 - (EVENTS_PAGE_SIZE - 1));
    expect(argsOf(fake.queries[0], "eq")).toEqual(["run_id", RUN_ID]);
    expect(argsOf(fake.queries[0], "lt")).toEqual(["id", 2000]);
  });

  it("has no cursor on the last page", async () => {
    withFake(() => ({ data: [], error: null }));
    expect((await listEvents()).nextCursor).toBeNull();
  });
});

describe("getGateForDecision", () => {
  it("does not read the gate's commit SHA", async () => {
    const fake = withFake((q) => {
      if (q.table === "gates") return { data: { id: GATE_ID, run_id: RUN_ID, kind: "release" }, error: null };
      if (q.table === "runs") return { data: { project_id: PROJECT_ID }, error: null };
      return { data: { registry_id: "example-app" }, error: null };
    });
    expect(await getGateForDecision(GATE_ID)).toEqual({
      gateId: GATE_ID,
      runId: RUN_ID,
      kind: "release",
      registryId: "example-app",
    });
    const gateSelect = argsOf(fake.queries[0], "select")?.[0];
    expect(gateSelect).not.toMatch(/commit_sha/);
  });
});

describe("listPendingGates", () => {
  it("joins runs, projects and steps", async () => {
    withFake((q) => {
      if (q.table === "gate_approval_status")
        return {
          data: [{ gate_id: GATE_ID, run_id: RUN_ID, kind: "spec", commit_sha: "abcdef1", status: "pending" }],
          error: null,
        };
      if (q.table === "runs") return { data: [run], error: null };
      if (q.table === "projects") return { data: [project], error: null };
      return { data: [], error: null };
    });
    const [pending] = await listPendingGates();
    expect(pending.gate.gate_id).toBe(GATE_ID);
    expect(pending.project?.registry_id).toBe("example-app");
  });
});
