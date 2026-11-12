/**
 * @jest-environment node
 */
import { argsOf, createFakeSupabase, type FakeQuery } from "@/test-utils/fake-supabase";
import { auditReport, findings } from "@/test-utils/site-reports";

const requireOwner = jest.fn();
const createClient = jest.fn();

jest.mock("@/lib/auth", () => ({ requireOwner: () => requireOwner() }));
jest.mock("@/lib/supabase/server", () => ({ createClient: () => createClient() }));
// Two registered sites (registry entries with an audits block) and one without.
const registry = new Map<string, { id: string; audits?: { url: string } }>([
  ["denkore-com", { id: "denkore-com", audits: { url: "https://www.denkore.com" } }],
  ["ggrmusic-com", { id: "ggrmusic-com", audits: { url: "https://www.ggrmusic.com" } }],
  ["sample", { id: "sample" }],
]);
jest.mock("@/lib/registry/cached", () => ({ getRegistry: async () => registry }));

import { getSiteReport, listSites, SITES_SCAN_LIMIT } from "../queries";

const ID_A2 = "6f1c2b9e-4a3d-4c1e-9b7a-2d5e8f0a1b3c";
const ID_A1 = "7a2d3c0f-5b4e-4d2f-8c8b-3e6f9a1b2c4d";
const ID_B1 = "8b3e4d1a-6c5f-4e3a-9d9c-4f7a0b2c3d5e";

function row(id: string, target: string, startedAt: string, counts = { info: 1, warn: 2, fail: 0 }) {
  return {
    id,
    project_id: null as string | null,
    target,
    started_at: startedAt,
    finished_at: startedAt,
    pages_checked: 3,
    info_count: counts.info,
    warn_count: counts.warn,
    fail_count: counts.fail,
  };
}
const withReport = (r: ReturnType<typeof row>, report = auditReport([findings.noTitle])) => ({ ...r, report });

function withFake(respond: (q: FakeQuery) => { data: unknown; error: null | { message: string; code?: string } }) {
  const fake = createFakeSupabase(respond);
  requireOwner.mockResolvedValue({ id: "owner", email: null });
  createClient.mockResolvedValue(fake.client);
  return fake;
}

beforeEach(() => {
  requireOwner.mockReset();
  createClient.mockReset();
});

describe.each([
  ["listSites", () => listSites(NOW)],
  ["getSiteReport", () => getSiteReport(ID_A1)],
])("%s checks the owner first", (_name, call) => {
  it("queries nothing when requireOwner throws", async () => {
    const fake = createFakeSupabase();
    createClient.mockResolvedValue(fake.client);
    requireOwner.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(call()).rejects.toThrow("NEXT_REDIRECT");
    expect(createClient).not.toHaveBeenCalled();
    expect(fake.queries).toHaveLength(0);
  });
});

const P_DENKORE = "11111111-1111-4111-8111-111111111111";
const P_GGR = "22222222-2222-4222-8222-222222222222";
const DAY = 24 * 3_600_000;
const NOW = new Date("2026-11-12T12:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * DAY).toISOString();

/** The two tables listSites reads: report summaries (newest first) and the registered projects. */
function listFake(reports: unknown[], projects: Array<{ id: string; registry_id: string; created_at: string }> = []) {
  return withFake((q) => ({ data: q.table === "projects" ? projects : reports, error: null }));
}
const withProject = (r: ReturnType<typeof row>, project_id: string | null) => ({ ...r, project_id });

describe("listSites", () => {
  it("is empty before any report is stored and no site is registered yet", async () => {
    listFake([]);
    expect(await listSites(NOW)).toEqual({ sites: [], unreported: [], truncated: false });
  });

  it("keeps the newest report per site and sorts by address", async () => {
    // Newest first, as the query orders them.
    listFake([
      withProject(row(ID_A2, "https://zeta.example/", "2026-11-08T10:00:00+00:00", { info: 0, warn: 0, fail: 1 }), null),
      withProject(row(ID_B1, "https://alpha.example/", "2026-11-05T10:00:00+00:00"), null),
      withProject(row(ID_A1, "https://zeta.example/", "2026-11-01T10:00:00+00:00"), null),
    ]);
    const { sites, truncated } = await listSites(NOW);
    expect(sites.map((s) => [s.target, s.id])).toEqual([
      ["https://alpha.example/", ID_B1],
      ["https://zeta.example/", ID_A2],
    ]);
    expect(sites[1]).toMatchObject({ startedAt: "2026-11-08T10:00:00+00:00", pagesChecked: 3, counts: { fail: 1, warn: 0, info: 0 } });
    expect(truncated).toBe(false);
  });

  it("asks for the newest reports first, without the findings", async () => {
    const fake = listFake([]);
    await listSites(NOW);
    const reports = fake.queries.find((q) => q.table === "audit_reports")!;
    expect(argsOf(reports, "select")![0]).not.toContain("report,");
    expect(argsOf(reports, "select")![0]).toContain("project_id");
    expect(argsOf(reports, "order")).toEqual(["started_at", { ascending: false }]);
    expect(argsOf(reports, "limit")).toEqual([SITES_SCAN_LIMIT]);
  });

  it("looks up the projects of the registered sites only: registry entries with an audits block", async () => {
    const fake = listFake([]);
    await listSites(NOW);
    const projects = fake.queries.find((q) => q.table === "projects")!;
    expect(argsOf(projects, "in")).toEqual(["registry_id", ["denkore-com", "ggrmusic-com"]]);
  });

  describe("overdue", () => {
    const projects = [
      { id: P_DENKORE, registry_id: "denkore-com", created_at: daysAgo(30) },
      { id: P_GGR, registry_id: "ggrmusic-com", created_at: daysAgo(30) },
    ];

    it("marks a registered site whose newest report is more than two days old, and not one that is fresh", async () => {
      listFake(
        [
          withProject(row(ID_A1, "https://www.denkore.com/", daysAgo(1)), P_DENKORE),
          withProject(row(ID_B1, "https://www.ggrmusic.com/", daysAgo(3)), P_GGR),
        ],
        projects,
      );
      const { sites } = await listSites(NOW);
      expect(sites.map((s) => [s.target, s.overdue])).toEqual([
        ["https://www.denkore.com/", false],
        ["https://www.ggrmusic.com/", true],
      ]);
    });

    it("judges a site by its newest report across all its addresses", async () => {
      // The newest report is fresh, so the older address of the same project is not overdue either.
      listFake(
        [
          withProject(row(ID_A2, "https://www.denkore.com/", daysAgo(0.5)), P_DENKORE),
          withProject(row(ID_A1, "https://denkore.com/", daysAgo(5)), P_DENKORE),
        ],
        projects,
      );
      expect((await listSites(NOW)).sites.map((s) => s.overdue)).toEqual([false, false]);
    });

    it("never marks a site that is not registered (a prospect posted with --url), however old", async () => {
      listFake([withProject(row(ID_A1, "https://prospect.example/", daysAgo(40)), null)], projects);
      expect((await listSites(NOW)).sites[0].overdue).toBe(false);
    });

    it("lists a registered site with no report at all, overdue only once it has been registered more than two days", async () => {
      listFake([], [
        { id: P_DENKORE, registry_id: "denkore-com", created_at: daysAgo(10) },
        { id: P_GGR, registry_id: "ggrmusic-com", created_at: daysAgo(1) },
      ]);
      expect((await listSites(NOW)).unreported).toEqual([
        { registryId: "denkore-com", overdue: true },
        { registryId: "ggrmusic-com", overdue: false },
      ]);
    });

    it("does not list a site that has a report as unreported", async () => {
      listFake([withProject(row(ID_A1, "https://www.denkore.com/", daysAgo(1)), P_DENKORE)], projects);
      expect((await listSites(NOW)).unreported).toEqual([{ registryId: "ggrmusic-com", overdue: true }]);
    });
  });

  it("says so when it read as many reports as it is allowed to", async () => {
    listFake(
      Array.from({ length: SITES_SCAN_LIMIT }, (_, i) =>
        withProject(row(ID_A1, "https://zeta.example/", `2026-11-01T10:00:${String(i % 60).padStart(2, "0")}+00:00`), null),
      ),
    );
    expect((await listSites(NOW)).truncated).toBe(true);
  });

  it("fails loudly on an unexpected row shape", async () => {
    listFake([{ ...withProject(row(ID_A1, "https://zeta.example/", "2026-11-01T10:00:00+00:00"), null), warn_count: "many" }]);
    await expect(listSites(NOW)).rejects.toThrow(/Unexpected audit_reports row shape/);
  });

  it("throws the database error, from either read", async () => {
    withFake(() => ({ data: null, error: { code: "42501", message: "permission denied for table audit_reports" } }));
    await expect(listSites(NOW)).rejects.toThrow(/listSites failed: permission denied/);

    withFake((q) => (q.table === "projects" ? { data: null, error: { message: "timeout" } } : { data: [], error: null }));
    await expect(listSites(NOW)).rejects.toThrow(/registered sites\) failed: timeout/);
  });
});

describe("getSiteReport", () => {
  it("returns the report and the one just before it for the same site", async () => {
    const current = withReport(row(ID_A2, "https://zeta.example/", "2026-11-08T10:00:00+00:00"), auditReport([findings.noRobots]));
    const earlier = withReport(row(ID_A1, "https://zeta.example/", "2026-11-01T10:00:00+00:00"), auditReport([findings.noTitle]));
    const fake = withFake((q) => (argsOf(q, "maybeSingle") ? { data: current, error: null } : { data: [earlier], error: null }));

    const result = await getSiteReport(ID_A2);
    expect(result?.current).toMatchObject({ id: ID_A2, target: "https://zeta.example/", report: current.report });
    expect(result?.previous).toMatchObject({ id: ID_A1, report: earlier.report });
    expect(argsOf(fake.queries[0], "eq")).toEqual(["id", ID_A2]);
    const prev = fake.queries[1];
    expect(argsOf(prev, "eq")).toEqual(["target", "https://zeta.example/"]);
    expect(argsOf(prev, "lt")).toEqual(["started_at", "2026-11-08T10:00:00+00:00"]);
    expect(argsOf(prev, "order")).toEqual(["started_at", { ascending: false }]);
    expect(argsOf(prev, "limit")).toEqual([1]);
  });

  it("has no previous report for a site's first", async () => {
    const first = withReport(row(ID_A1, "https://zeta.example/", "2026-11-01T10:00:00+00:00"));
    withFake((q) => (argsOf(q, "maybeSingle") ? { data: first, error: null } : { data: [], error: null }));
    expect((await getSiteReport(ID_A1))?.previous).toBeNull();
  });

  it("is null for an id that is not a UUID, without querying", async () => {
    const fake = withFake(() => ({ data: null, error: null }));
    expect(await getSiteReport("../etc/passwd")).toBeNull();
    expect(fake.queries).toHaveLength(0);
  });

  it("is null when no such report exists, and looks for no previous one", async () => {
    const fake = withFake(() => ({ data: null, error: null }));
    expect(await getSiteReport(ID_A1)).toBeNull();
    expect(fake.queries).toHaveLength(1);
  });

  it("fails loudly when a stored report no longer fits the schema", async () => {
    const bad = withReport(row(ID_A1, "https://zeta.example/", "2026-11-01T10:00:00+00:00"));
    withFake(() => ({ data: { ...bad, report: { ...bad.report, schemaVersion: 2 } }, error: null }));
    await expect(getSiteReport(ID_A1)).rejects.toThrow(/Unexpected audit_reports row shape/);
  });

  it("throws the database error from either query", async () => {
    withFake(() => ({ data: null, error: { message: "connection reset" } }));
    await expect(getSiteReport(ID_A1)).rejects.toThrow(/getSiteReport failed: connection reset/);

    const current = withReport(row(ID_A1, "https://zeta.example/", "2026-11-01T10:00:00+00:00"));
    withFake((q) => (argsOf(q, "maybeSingle") ? { data: current, error: null } : { data: null, error: { message: "timeout" } }));
    await expect(getSiteReport(ID_A1)).rejects.toThrow(/previous report\) failed: timeout/);
  });
});
