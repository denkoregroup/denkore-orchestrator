/**
 * @jest-environment node
 */
import { argsOf, createFakeSupabase, type FakeQuery } from "@/test-utils/fake-supabase";
import { REVIEWED_SHA, reviewReport, runReport } from "@/test-utils/run-reports";

const requireOwner = jest.fn();
const createClient = jest.fn();
jest.mock("@/lib/auth", () => ({ requireOwner: () => requireOwner() }));
jest.mock("@/lib/supabase/server", () => ({ createClient: () => createClient() }));

import { getLatestRunReports, getNewestRunReport, getPullVerdicts } from "../run-reports";

const NOW = new Date("2026-11-24T20:00:00Z");

function withRows(rows: unknown, answers: unknown = []) {
  const fake = createFakeSupabase((q) => ({ data: q.table === "events" ? answers : rows, error: null }));
  createClient.mockResolvedValue(fake.client);
  return fake;
}

const ID_HONEY = "0b6f2f8e-3c1a-4d5e-9f7a-1b2c3d4e5f60";
const ID_OTHER = "1c7a3e9f-4d2b-4e6f-8a1b-2c3d4e5f6a70";
const row = (report: ReturnType<typeof runReport>, id = ID_OTHER) => ({ id, registry_id: report.registryId, received_at: report.finishedAt, report });

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

  it("leaves out the Conductor review's reports", async () => {
    const fake = withRows([]);
    await getLatestRunReports(NOW);
    expect(argsOf(fake.queries[0], "neq")).toEqual(["mode", "review"]);
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
    withRows([row(barziniQuiet), row(honeyNew, ID_HONEY), row(honeyOld)]);
    const latest = await getLatestRunReports(NOW);
    expect(latest.map((l) => [l.report.registryId, l.report.startedAt])).toEqual([
      ["honeybees", honeyNew.startedAt],
      ["barzini-publishing", barziniQuiet.startedAt],
    ]);
  });

  it("attaches your answers to the newest reports that asked something, by decision number", async () => {
    const asked = runReport();
    const quiet = runReport({ registryId: "barzini-publishing", repo: "denkoregroup/barzini-publishing", decisions: [] });
    const fake = withRows(
      [row(asked, ID_HONEY), row(quiet, ID_OTHER)],
      [
        {
          payload: { run_report_id: ID_HONEY, registry_id: "honeybees", decision_number: 2, question: "Take the product reviews item next?", answer: "Yes" },
          created_at: "2026-11-24T16:00:00Z",
        },
      ],
    );
    const latest = await getLatestRunReports(NOW);
    expect(latest[0]).toMatchObject({ id: ID_HONEY, answers: { 2: { answer: "Yes", answeredAt: "2026-11-24T16:00:00Z" } } });
    expect(latest[1].answers).toEqual({});
    const events = fake.queries.find((q) => q.table === "events")!;
    expect(argsOf(events, "eq")).toEqual(["kind", "run.answered"]);
    expect(argsOf(events, "in")).toEqual(["payload->>run_report_id", [ID_HONEY]]);
  });

  it("doesn't look for answers when no report asked anything", async () => {
    const fake = withRows([row(runReport({ decisions: [] }), ID_HONEY)]);
    await getLatestRunReports(NOW);
    expect(fake.queries.map((q) => q.table)).toEqual(["run_reports"]);
  });

  it("fails loudly when a stored report doesn't match the schema", async () => {
    withRows([{ id: ID_HONEY, registry_id: "honeybees", received_at: "x", report: { schemaVersion: 9 } }]);
    await expect(getLatestRunReports(NOW)).rejects.toThrow(/run_reports/);
  });

  it("throws on a query error", async () => {
    const fake = createFakeSupabase(() => ({ data: null, error: { message: "permission denied" } }));
    createClient.mockResolvedValue(fake.client);
    await expect(getLatestRunReports(NOW)).rejects.toThrow(/permission denied/);
  });
});

describe("getNewestRunReport", () => {
  it("checks the owner, then reads the project's newest report of any age", async () => {
    const report = runReport();
    const fake = withRows([row(report, ID_HONEY)]);
    expect(await getNewestRunReport("honeybees")).toEqual({ id: ID_HONEY, report });
    const q = fake.queries[0];
    expect(argsOf(q, "eq")).toEqual(["registry_id", "honeybees"]);
    expect(argsOf(q, "order")).toEqual(["started_at", { ascending: false }]);
    expect(argsOf(q, "neq")).toEqual(["mode", "review"]);
    expect(argsOf(q, "limit")).toEqual([1]);
    expect(argsOf(q, "gte")).toBeUndefined();
  });

  it("is null when the project has no report", async () => {
    withRows([]);
    expect(await getNewestRunReport("honeybees")).toBeNull();
  });

  it("stops at the owner check", async () => {
    requireOwner.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));
    await expect(getNewestRunReport("honeybees")).rejects.toThrow("NEXT_REDIRECT");
    expect(createClient).not.toHaveBeenCalled();
  });
});

describe("getPullVerdicts", () => {
  it("checks the owner before reading anything", async () => {
    requireOwner.mockRejectedValueOnce(new Error("NEXT_REDIRECT"));
    await expect(getPullVerdicts(NOW)).rejects.toThrow("NEXT_REDIRECT");
    expect(createClient).not.toHaveBeenCalled();
  });

  it("reads only the review reports from the last week, newest first", async () => {
    const fake = withRows([]);
    expect(await getPullVerdicts(NOW)).toEqual({});
    const q = fake.queries[0];
    expect(argsOf(q, "eq")).toEqual(["mode", "review"]);
    expect(argsOf(q, "gte")).toEqual(["started_at", "2026-11-17T20:00:00.000Z"]);
    expect(argsOf(q, "order")).toEqual(["started_at", { ascending: false }]);
  });

  it("keeps the newest verdict on each PR, keyed by repo and number, with when it was given", async () => {
    const newer = reviewReport({ pulls: [reviewReport().pulls[0]] });
    const older = reviewReport({ startedAt: "2026-11-24T12:37:00.000Z", finishedAt: "2026-11-24T12:50:00.000Z" });
    const barzini = reviewReport({
      registryId: "barzini-publishing",
      repo: "denkoregroup/Barzini-Publishing",
      pulls: [{ ...reviewReport().pulls[0], number: 120, review: { verdict: "changes-needed", reason: "A test fails", headSha: REVIEWED_SHA } }],
    });
    withRows([row(newer), row(barzini), row(older)]);
    expect(await getPullVerdicts(NOW)).toEqual({
      "denkoregroup/honeybees#51": { verdict: "ready", headSha: REVIEWED_SHA, reviewedAt: newer.finishedAt },
      "denkoregroup/honeybees#52": { ...older.pulls[1].review, reviewedAt: older.finishedAt },
      "denkoregroup/barzini-publishing#120": { verdict: "changes-needed", reason: "A test fails", headSha: REVIEWED_SHA, reviewedAt: barzini.finishedAt },
    });
  });
});
