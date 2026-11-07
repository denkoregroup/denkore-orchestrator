/**
 * @jest-environment node
 */
import { argsOf, createFakeSupabase, type FakeQuery } from "@/test-utils/fake-supabase";
import { auditReport, findings } from "@/test-utils/site-reports";

const createServiceClient = jest.fn();
jest.mock("@/lib/supabase/admin", () => ({ createServiceClient: () => createServiceClient() }));

import { SupabaseReportStore } from "../supabase-ingest-store";

const PROJECT_ID = "7a2d3c0f-5b4e-4d2f-8c8b-3e6f9a1b2c4d";
const report = auditReport([findings.noTitle, findings.noRobots, findings.brokenLink]);

function withFake(respond: (q: FakeQuery) => { data: unknown; error: null | { message: string; code?: string } }) {
  const fake = createFakeSupabase(respond);
  createServiceClient.mockReturnValue(fake.client);
  return fake;
}

beforeEach(() => createServiceClient.mockReset());

describe("SupabaseReportStore", () => {
  it("inserts one row with the counts taken from the report", async () => {
    const fake = withFake(() => ({ data: null, error: null }));
    const result = await new SupabaseReportStore().record({ report });

    expect(result).toEqual({ status: "recorded", projectLinked: false });
    expect(fake.queries.map((q) => q.table)).toEqual(["audit_reports"]);
    expect(argsOf(fake.queries[0], "insert")).toEqual([
      {
        project_id: null,
        target: report.target,
        started_at: report.startedAt,
        finished_at: report.finishedAt,
        pages_checked: 3,
        info_count: 1,
        warn_count: 1,
        fail_count: 1,
        report,
      },
    ]);
  });

  it("looks the project up by registry id and links it", async () => {
    const fake = withFake((q) => (q.table === "projects" ? { data: { id: PROJECT_ID }, error: null } : { data: null, error: null }));
    const result = await new SupabaseReportStore().record({ registryId: "example-app", report });

    expect(result).toEqual({ status: "recorded", projectLinked: true });
    expect(argsOf(fake.queries[0], "eq")).toEqual(["registry_id", "example-app"]);
    expect((argsOf(fake.queries[1], "insert")![0] as { project_id: string }).project_id).toBe(PROJECT_ID);
  });

  it("stores the report with no project when the registry id matches none", async () => {
    const fake = withFake(() => ({ data: null, error: null }));
    const result = await new SupabaseReportStore().record({ registryId: "not-synced-yet", report });

    expect(result).toEqual({ status: "recorded", projectLinked: false });
    expect((argsOf(fake.queries[1], "insert")![0] as { project_id: null }).project_id).toBeNull();
  });

  it("reports a unique violation as a duplicate", async () => {
    withFake(() => ({ data: null, error: { code: "23505", message: "duplicate key value" } }));
    await expect(new SupabaseReportStore().record({ report })).resolves.toEqual({ status: "duplicate", projectLinked: false });
  });

  it("throws on any other insert error", async () => {
    withFake(() => ({ data: null, error: { code: "42501", message: "permission denied for table audit_reports" } }));
    await expect(new SupabaseReportStore().record({ report })).rejects.toThrow(/insert failed: permission denied/);
  });

  it("throws, and inserts nothing, when the project lookup fails", async () => {
    const fake = withFake(() => ({ data: null, error: { message: "connection reset" } }));
    await expect(new SupabaseReportStore().record({ registryId: "example-app", report })).rejects.toThrow(/project lookup failed/);
    expect(fake.queries.map((q) => q.table)).toEqual(["projects"]);
  });
});
