/**
 * @jest-environment node
 */
import { argsOf, createFakeSupabase, type FakeQuery } from "@/test-utils/fake-supabase";
import { runReport } from "@/test-utils/run-reports";

const requireOwner = jest.fn();
const createClient = jest.fn();
jest.mock("@/lib/auth", () => ({ requireOwner: () => requireOwner() }));
jest.mock("@/lib/supabase/server", () => ({ createClient: () => createClient() }));

import { getLatestRunReports } from "../run-reports";

const NOW = new Date("2026-11-24T20:00:00Z");

function withRows(rows: unknown) {
  const fake = createFakeSupabase(() => ({ data: rows, error: null }));
  createClient.mockResolvedValue(fake.client);
  return fake;
}

const row = (report: ReturnType<typeof runReport>) => ({ registry_id: report.registryId, received_at: report.finishedAt, report });

afterEach(() => jest.clearAllMocks());

describe("getLatestRunReports", () => {
  it("checks the owner before reading anything", async () => {
    requireOwner.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));
    await expect(getLatestRunReports(NOW)).rejects.toThrow("NEXT_REDIRECT");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("reads the last week, newest first", async () => {
    const fake = withRows([]);
    expect(await getLatestRunReports(NOW)).toEqual([]);
    const q = fake.queries[0] as FakeQuery;
    expect(q.table).toBe("run_reports");
    expect(argsOf(q, "gte")).toEqual(["started_at", "2026-11-17T20:00:00.000Z"]);
    expect(argsOf(q, "order")).toEqual(["started_at", { ascending: false }]);
  });

  it("keeps each project's newest run, and puts runs with decisions first", async () => {
    const honeyNew = runReport({ startedAt: "2026-11-24T11:42:00.000Z", finishedAt: "2026-11-24T12:00:00.000Z" });
    const honeyOld = runReport({ startedAt: "2026-11-23T23:42:00.000Z", finishedAt: "2026-11-24T00:00:00.000Z", summary: "Older" });
    const barziniQuiet = runReport({
      registryId: "barzini-publishing",
      repo: "denkoregroup/barzini-publishing",
      startedAt: "2026-11-24T11:43:00.000Z",
      finishedAt: "2026-11-24T12:05:00.000Z",
      decisions: [],
    });
    withRows([row(barziniQuiet), row(honeyNew), row(honeyOld)]);
    const latest = await getLatestRunReports(NOW);
    expect(latest.map((l) => [l.report.registryId, l.report.startedAt])).toEqual([
      ["honeybees", honeyNew.startedAt],
      ["barzini-publishing", barziniQuiet.startedAt],
    ]);
  });

  it("fails loudly when a stored report doesn't match the schema", async () => {
    withRows([{ registry_id: "honeybees", received_at: "x", report: { schemaVersion: 9 } }]);
    await expect(getLatestRunReports(NOW)).rejects.toThrow(/run_reports/);
  });

  it("throws on a query error", async () => {
    const fake = createFakeSupabase(() => ({ data: null, error: { message: "permission denied" } }));
    createClient.mockResolvedValue(fake.client);
    await expect(getLatestRunReports(NOW)).rejects.toThrow(/permission denied/);
  });
});
