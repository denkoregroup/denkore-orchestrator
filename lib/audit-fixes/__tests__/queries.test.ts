/**
 * @jest-environment node
 */
import { argsOf, createFakeSupabase, hasOp, type FakeQuery } from "@/test-utils/fake-supabase";

const requireOwner = jest.fn();
const createClient = jest.fn();
jest.mock("@/lib/auth", () => ({ requireOwner: () => requireOwner() }));
jest.mock("@/lib/supabase/server", () => ({ createClient: () => createClient() }));
const registry = new Map<string, { id: string; repo: string }>([["denkore-com", { id: "denkore-com", repo: "dclarktech302/denkore" }]]);
jest.mock("@/lib/registry/cached", () => ({ getRegistry: async () => registry }));

import { loadFixContext } from "../queries";

const REPORT = "6f1c2b9e-4a3d-4c1e-9b7a-2d5e8f0a1b3c";
const NEWER = "7a2d3c0f-5b4e-4d2f-8c8b-3e6f9a1b2c4d";
const PROJECT = "11111111-1111-4111-8111-111111111111";
const RUN = "22222222-2222-4222-8222-222222222222";
const TARGET = "https://www.denkore.com/";

interface World {
  projectId?: string | null;
  registryId?: string | null;
  newestReport?: string;
  openRun?: string | null;
  findingIds?: string[] | null;
}

function world(w: World = {}) {
  const { projectId = PROJECT, registryId = "denkore-com", newestReport = REPORT, openRun = null, findingIds = [] } = w;
  const fake = createFakeSupabase((q: FakeQuery) => {
    if (q.table === "audit_reports" && argsOf(q, "maybeSingle")) return { data: { project_id: projectId }, error: null };
    if (q.table === "audit_reports") return { data: [{ id: newestReport }], error: null };
    if (q.table === "projects") return { data: registryId ? { registry_id: registryId } : null, error: null };
    if (q.table === "runs") return { data: openRun ? [{ id: openRun }] : [], error: null };
    if (q.table === "events") return { data: findingIds === null ? [] : [{ payload: { finding_ids: findingIds } }], error: null };
    return { data: null, error: null };
  });
  requireOwner.mockResolvedValue({ id: "owner", email: null });
  createClient.mockResolvedValue(fake.client);
  return fake;
}

beforeEach(() => {
  requireOwner.mockReset();
  createClient.mockReset();
});

describe("loadFixContext", () => {
  it("checks the owner first, and reads nothing for anyone else", async () => {
    const fake = createFakeSupabase();
    createClient.mockResolvedValue(fake.client);
    requireOwner.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(loadFixContext(REPORT, TARGET)).rejects.toThrow("NEXT_REDIRECT");
    expect(fake.queries).toHaveLength(0);
  });

  it("says a report with no project has no repository, and reads nothing else", async () => {
    const fake = world({ projectId: null });
    expect(await loadFixContext(REPORT, TARGET)).toEqual({ projectId: null, repo: null, isLatest: false, openRun: null });
    expect(fake.queries.map((q) => q.table)).toEqual(["audit_reports"]);
  });

  it("takes the repository from the project registry", async () => {
    world();
    expect(await loadFixContext(REPORT, TARGET)).toEqual({ projectId: PROJECT, repo: "dclarktech302/denkore", isLatest: true, openRun: null });
  });

  it("has no repository when the project is not in the registry", async () => {
    world({ registryId: "removed-site" });
    expect((await loadFixContext(REPORT, TARGET)).repo).toBeNull();
    world({ registryId: null });
    expect((await loadFixContext(REPORT, TARGET)).repo).toBeNull();
  });

  it("is the latest report only if it is the newest for the address", async () => {
    const fake = world({ newestReport: NEWER });
    expect((await loadFixContext(REPORT, TARGET)).isLatest).toBe(false);
    const newest = fake.queries.filter((q) => q.table === "audit_reports")[1];
    expect(argsOf(newest, "eq")).toEqual(["target", TARGET]);
    expect(argsOf(newest, "order")).toEqual(["started_at", { ascending: false }]);
  });

  it("finds the site's open fix run, and the findings it was started for", async () => {
    const fake = world({ openRun: RUN, findingIds: ["aaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbb"] });
    expect((await loadFixContext(REPORT, TARGET)).openRun).toEqual({ id: RUN, findingIds: ["aaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbb"] });
    const runs = fake.queries.find((q) => q.table === "runs")!;
    expect(argsOf(runs, "eq")).toEqual(["project_id", PROJECT]);
    expect(argsOf(runs, "like")).toEqual(["prompt", "[audit-fix]%"]);
    expect(argsOf(runs, "not")).toEqual(["state", "in", "(done,failed,cancelled,escalated)"]);
  });

  it("does not look for the findings when no run is open", async () => {
    const fake = world();
    await loadFixContext(REPORT, TARGET);
    expect(fake.queries.some((q) => q.table === "events")).toBe(false);
  });

  it("treats an open run with no recorded event as having no findings in it", async () => {
    world({ openRun: RUN, findingIds: null });
    expect((await loadFixContext(REPORT, TARGET)).openRun).toEqual({ id: RUN, findingIds: [] });
  });

  it("fails loudly when the report cannot be read, or the database errors", async () => {
    createFakeSupabase();
    const missing = createFakeSupabase(() => ({ data: null, error: null }));
    requireOwner.mockResolvedValue({ id: "owner", email: null });
    createClient.mockResolvedValue(missing.client);
    await expect(loadFixContext(REPORT, TARGET)).rejects.toThrow(/report cannot be read/);

    const broken = createFakeSupabase(() => ({ data: null, error: { message: "permission denied" } }));
    createClient.mockResolvedValue(broken.client);
    await expect(loadFixContext(REPORT, TARGET)).rejects.toThrow(/loadFixContext \(report\) failed: permission denied/);
  });

  it("uses the owner's session for every read (row level security applies)", async () => {
    const fake = world({ openRun: RUN });
    await loadFixContext(REPORT, TARGET);
    expect(fake.queries.every((q) => !hasOp(q, "insert") && !hasOp(q, "update") && !hasOp(q, "delete"))).toBe(true);
    expect(createClient).toHaveBeenCalledTimes(1);
  });
});
