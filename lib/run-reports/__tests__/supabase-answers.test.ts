/**
 * @jest-environment node
 */
import { argsOf, createFakeSupabase, hasOp, type FakeQuery } from "@/test-utils/fake-supabase";
import { runReport } from "@/test-utils/run-reports";

const createServiceClient = jest.fn();
jest.mock("@/lib/supabase/admin", () => ({ createServiceClient: () => createServiceClient() }));

import { SupabaseRunAnswerStore } from "../supabase-answers";

const REPORT_ID = "0b6f2f8e-3c1a-4d5e-9f7a-1b2c3d4e5f60";
const report = runReport();

function answer(number: number, text: string, at: string) {
  return {
    payload: { run_report_id: REPORT_ID, registry_id: "honeybees", decision_number: number, question: "as typed", answer: text },
    created_at: at,
  };
}

function withFake(respond: (q: FakeQuery) => { data: unknown; error: null | { message: string } }) {
  const fake = createFakeSupabase(respond);
  createServiceClient.mockReturnValue(fake.client);
  return fake;
}

beforeEach(() => createServiceClient.mockReset());

describe("SupabaseRunAnswerStore", () => {
  it("returns the answers to the project's newest report, with the report's own questions, by number", async () => {
    const fake = withFake((q) =>
      q.table === "run_reports"
        ? { data: { id: REPORT_ID, started_at: report.startedAt, report }, error: null }
        : { data: [answer(2, "Yes", "2026-11-24T16:00:00Z"), answer(1, "US only", "2026-11-24T15:00:00Z"), answer(9, "stray", "2026-11-24T15:00:00Z")], error: null },
    );
    expect(await new SupabaseRunAnswerStore().answersFor("honeybees")).toEqual({
      runStartedAt: report.startedAt,
      answers: [
        { number: 1, question: "Should the shipping page list international rates?", answer: "US only", answeredAt: "2026-11-24T15:00:00Z" },
        { number: 2, question: "Take the product reviews item next?", answer: "Yes", answeredAt: "2026-11-24T16:00:00Z" },
      ],
    });
    const [reports, events] = fake.queries;
    expect(argsOf(reports, "eq")).toEqual(["registry_id", "honeybees"]);
    expect(argsOf(reports, "neq")).toEqual(["mode", "review"]);
    expect(argsOf(reports, "order")).toEqual(["started_at", { ascending: false }]);
    expect(events.table).toBe("events");
    expect(events.ops.filter((o) => o.method === "eq").map((o) => o.args)).toEqual([
      ["kind", "run.answered"],
      ["payload->>run_report_id", REPORT_ID],
    ]);
    expect(fake.queries.some((q) => hasOp(q, "insert") || hasOp(q, "update") || hasOp(q, "delete"))).toBe(false);
  });

  it("says there is no report when the project has none", async () => {
    const fake = withFake(() => ({ data: null, error: null }));
    expect(await new SupabaseRunAnswerStore().answersFor("honeybees")).toEqual({ runStartedAt: null, answers: [] });
    expect(fake.queries).toHaveLength(1);
  });

  it("throws on a read error", async () => {
    withFake(() => ({ data: null, error: { message: "permission denied" } }));
    await expect(new SupabaseRunAnswerStore().answersFor("honeybees")).rejects.toThrow(/permission denied/);
  });
});
