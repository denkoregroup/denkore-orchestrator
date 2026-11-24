/**
 * @jest-environment node
 */
import { argsOf, createFakeSupabase, type FakeQuery } from "@/test-utils/fake-supabase";
import { runReport } from "@/test-utils/run-reports";

const createServiceClient = jest.fn();
jest.mock("@/lib/supabase/admin", () => ({ createServiceClient: () => createServiceClient() }));

import { SupabaseRunReportStore } from "../supabase-store";

function withFake(respond: (q: FakeQuery) => { data: unknown; error: null | { message: string; code?: string } }) {
  const fake = createFakeSupabase(respond);
  createServiceClient.mockReturnValue(fake.client);
  return fake;
}

beforeEach(() => createServiceClient.mockReset());

describe("SupabaseRunReportStore", () => {
  it("inserts one row, with the repo in lower case and the decision count", async () => {
    const fake = withFake(() => ({ data: null, error: null }));
    const report = runReport({ repo: "DenkoreGroup/HoneyBees" });
    expect(await new SupabaseRunReportStore().record(report)).toEqual({ status: "recorded" });
    expect(fake.queries.map((q) => q.table)).toEqual(["run_reports"]);
    expect(argsOf(fake.queries[0], "insert")).toEqual([
      {
        registry_id: "honeybees",
        repo: "denkoregroup/honeybees",
        mode: "may-start",
        started_at: report.startedAt,
        finished_at: report.finishedAt,
        decision_count: 2,
        report,
      },
    ]);
  });

  it("reports a unique violation as a duplicate", async () => {
    withFake(() => ({ data: null, error: { code: "23505", message: "duplicate key value" } }));
    await expect(new SupabaseRunReportStore().record(runReport())).resolves.toEqual({ status: "duplicate" });
  });

  it("throws on any other insert error", async () => {
    withFake(() => ({ data: null, error: { code: "42501", message: "permission denied for table run_reports" } }));
    await expect(new SupabaseRunReportStore().record(runReport())).rejects.toThrow(/insert failed: permission denied/);
  });
});
