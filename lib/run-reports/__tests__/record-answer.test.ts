/**
 * @jest-environment node
 */
import { argsOf, createFakeSupabase } from "@/test-utils/fake-supabase";

const createServiceClient = jest.fn();
jest.mock("@/lib/supabase/admin", () => ({ createServiceClient: () => createServiceClient() }));

import { recordRunAnswer } from "../record-answer";

const REPORT_ID = "0b6f2f8e-3c1a-4d5e-9f7a-1b2c3d4e5f60";
const payload = { run_report_id: REPORT_ID, registry_id: "honeybees", decision_number: 1, question: "International rates?", answer: "US only" };

function withResult(error: null | { code?: string; message: string }) {
  const fake = createFakeSupabase(() => ({ data: null, error }));
  createServiceClient.mockReturnValue(fake.client);
  return fake;
}

describe("recordRunAnswer", () => {
  it("stores one event with no run, keyed to the report and the decision", async () => {
    const fake = withResult(null);
    expect(await recordRunAnswer({ ownerId: "owner-1", payload })).toEqual({ status: "recorded" });
    expect(fake.queries[0].table).toBe("events");
    expect(argsOf(fake.queries[0], "insert")).toEqual([
      { run_id: null, kind: "run.answered", payload, actor: "owner:owner-1", idempotency_key: `run.answered:${REPORT_ID}:1` },
    ]);
  });

  it("reports a second answer to the same decision as a duplicate", async () => {
    withResult({ code: "23505", message: "duplicate key" });
    expect(await recordRunAnswer({ ownerId: "owner-1", payload })).toEqual({ status: "duplicate" });
  });

  it("throws on any other error", async () => {
    withResult({ message: "permission denied" });
    await expect(recordRunAnswer({ ownerId: "owner-1", payload })).rejects.toThrow(/permission denied/);
  });
});
