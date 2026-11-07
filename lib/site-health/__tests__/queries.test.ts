/**
 * @jest-environment node
 */
import { argsOf, createFakeSupabase, type FakeQuery } from "@/test-utils/fake-supabase";
import { auditReport, findings } from "@/test-utils/site-reports";

const requireOwner = jest.fn();
const createClient = jest.fn();

jest.mock("@/lib/auth", () => ({ requireOwner: () => requireOwner() }));
jest.mock("@/lib/supabase/server", () => ({ createClient: () => createClient() }));

import { getSiteReport, listSites, SITES_SCAN_LIMIT } from "../queries";

const ID_A2 = "6f1c2b9e-4a3d-4c1e-9b7a-2d5e8f0a1b3c";
const ID_A1 = "7a2d3c0f-5b4e-4d2f-8c8b-3e6f9a1b2c4d";
const ID_B1 = "8b3e4d1a-6c5f-4e3a-9d9c-4f7a0b2c3d5e";

function row(id: string, target: string, startedAt: string, counts = { info: 1, warn: 2, fail: 0 }) {
  return {
    id,
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
  ["listSites", () => listSites()],
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

describe("listSites", () => {
  it("is empty before any report is stored", async () => {
    withFake(() => ({ data: [], error: null }));
    expect(await listSites()).toEqual({ sites: [], truncated: false });
  });

  it("keeps the newest report per site and sorts by address", async () => {
    // Newest first, as the query orders them.
    withFake(() => ({
      data: [
        row(ID_A2, "https://zeta.example/", "2026-11-08T10:00:00+00:00", { info: 0, warn: 0, fail: 1 }),
        row(ID_B1, "https://alpha.example/", "2026-11-05T10:00:00+00:00"),
        row(ID_A1, "https://zeta.example/", "2026-11-01T10:00:00+00:00"),
      ],
      error: null,
    }));
    const { sites, truncated } = await listSites();
    expect(sites.map((s) => [s.target, s.id])).toEqual([
      ["https://alpha.example/", ID_B1],
      ["https://zeta.example/", ID_A2],
    ]);
    expect(sites[1]).toMatchObject({ startedAt: "2026-11-08T10:00:00+00:00", pagesChecked: 3, counts: { fail: 1, warn: 0, info: 0 } });
    expect(truncated).toBe(false);
  });

  it("asks for the newest reports first, without the findings", async () => {
    const fake = withFake(() => ({ data: [], error: null }));
    await listSites();
    expect(argsOf(fake.queries[0], "select")![0]).not.toContain("report");
    expect(argsOf(fake.queries[0], "order")).toEqual(["started_at", { ascending: false }]);
    expect(argsOf(fake.queries[0], "limit")).toEqual([SITES_SCAN_LIMIT]);
  });

  it("says so when it read as many reports as it is allowed to", async () => {
    withFake(() => ({
      data: Array.from({ length: SITES_SCAN_LIMIT }, (_, i) => row(ID_A1, "https://zeta.example/", `2026-11-01T10:00:${String(i % 60).padStart(2, "0")}+00:00`)),
      error: null,
    }));
    expect((await listSites()).truncated).toBe(true);
  });

  it("fails loudly on an unexpected row shape", async () => {
    withFake(() => ({ data: [{ ...row(ID_A1, "https://zeta.example/", "2026-11-01T10:00:00+00:00"), warn_count: "many" }], error: null }));
    await expect(listSites()).rejects.toThrow(/Unexpected audit_reports row shape/);
  });

  it("throws the database error", async () => {
    withFake(() => ({ data: null, error: { code: "42501", message: "permission denied for table audit_reports" } }));
    await expect(listSites()).rejects.toThrow(/listSites failed: permission denied/);
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
