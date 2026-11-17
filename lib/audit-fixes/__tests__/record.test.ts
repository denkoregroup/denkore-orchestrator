/**
 * @jest-environment node
 */
import { argsOf, createFakeSupabase } from "@/test-utils/fake-supabase";

const createServiceClient = jest.fn();
jest.mock("@/lib/supabase/admin", () => ({ createServiceClient: () => createServiceClient() }));

import { recordFixRequested } from "../record";

const input = { runId: "6f1c2b9e-4a3d-4c1e-9b7a-2d5e8f0a1b3c", ownerId: "owner-id", reportId: "r-1", severity: "warn", findingIds: ["aaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbb"] };

describe("recordFixRequested", () => {
  it("writes one audit.fix_requested event for the run, with the finding ids, once", async () => {
    const fake = createFakeSupabase(() => ({ data: null, error: null }));
    createServiceClient.mockReturnValue(fake.client);
    await recordFixRequested(input);
    expect(fake.queries.map((q) => q.table)).toEqual(["events"]);
    expect(argsOf(fake.queries[0], "insert")).toEqual([
      {
        run_id: input.runId,
        kind: "audit.fix_requested",
        payload: { report_id: "r-1", severity: "warn", finding_ids: input.findingIds },
        actor: "owner:owner-id",
        idempotency_key: `audit.fix_requested:${input.runId}`,
      },
    ]);
  });

  it("throws when the event cannot be written", async () => {
    createServiceClient.mockReturnValue(createFakeSupabase(() => ({ data: null, error: { message: "permission denied" } })).client);
    await expect(recordFixRequested(input)).rejects.toThrow("recordFixRequested: permission denied");
  });
});
