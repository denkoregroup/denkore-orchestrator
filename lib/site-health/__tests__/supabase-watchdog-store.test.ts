/**
 * @jest-environment node
 */
import { argsOf, createFakeSupabase, type FakeQuery } from "@/test-utils/fake-supabase";

const createServiceClient = jest.fn();
jest.mock("@/lib/supabase/admin", () => ({ createServiceClient: () => createServiceClient() }));

import { SupabaseWatchdogStore } from "../supabase-watchdog-store";

const P1 = "7a2d3c0f-5b4e-4d2f-8c8b-3e6f9a1b2c4d";
const P2 = "8b3e4d1a-6c5f-4e3a-9d9c-4f7a0b2c3d5e";

function withFake(respond: (q: FakeQuery) => { data: unknown; error: null | { message: string; code?: string } }) {
  const fake = createFakeSupabase(respond);
  createServiceClient.mockReturnValue(fake.client);
  return fake;
}
beforeEach(() => createServiceClient.mockReset());

describe("watchedSites", () => {
  it("reads the projects for the registry ids, and each one's newest report", async () => {
    const fake = withFake((q) => {
      if (q.table === "projects")
        return { data: [{ id: P1, registry_id: "denkore-com", created_at: "2026-10-01T00:00:00+00:00" }, { id: P2, registry_id: "ggrmusic-com", created_at: "2026-10-02T00:00:00+00:00" }], error: null };
      const projectId = argsOf(q, "eq")?.[1];
      return { data: projectId === P1 ? [{ started_at: "2026-11-11T07:17:00+00:00" }] : [], error: null };
    });
    const sites = await new SupabaseWatchdogStore().watchedSites(["denkore-com", "ggrmusic-com"]);

    expect(sites).toEqual([
      { registryId: "denkore-com", registeredAt: "2026-10-01T00:00:00+00:00", lastReportAt: "2026-11-11T07:17:00+00:00" },
      { registryId: "ggrmusic-com", registeredAt: "2026-10-02T00:00:00+00:00", lastReportAt: null },
    ]);
    expect(argsOf(fake.queries[0], "in")).toEqual(["registry_id", ["denkore-com", "ggrmusic-com"]]);
    const newest = fake.queries[1];
    expect(newest.table).toBe("audit_reports");
    expect(argsOf(newest, "order")).toEqual(["started_at", { ascending: false }]);
    expect(argsOf(newest, "limit")).toEqual([1]);
  });

  it("throws, naming what failed, when either read fails", async () => {
    withFake(() => ({ data: null, error: { message: "connection reset" } }));
    await expect(new SupabaseWatchdogStore().watchedSites(["a"])).rejects.toThrow(/project lookup failed: connection reset/);

    withFake((q) => (q.table === "projects" ? { data: [{ id: P1, registry_id: "a", created_at: "2026-10-01T00:00:00+00:00" }], error: null } : { data: null, error: { message: "timeout" } }));
    await expect(new SupabaseWatchdogStore().watchedSites(["a"])).rejects.toThrow(/newest report for a failed: timeout/);
  });

  it("fails loudly on a row shape it doesn't know", async () => {
    withFake(() => ({ data: [{ id: "not-a-uuid", registry_id: "a", created_at: "x" }], error: null }));
    await expect(new SupabaseWatchdogStore().watchedSites(["a"])).rejects.toThrow();
  });
});

describe("escalate", () => {
  const event = { idempotencyKey: "audit.overdue:denkore-com:2026-11-08T07:17:00.000Z", payload: { registryId: "denkore-com", lastReportAt: null, registeredAt: "x", overdueAfterHours: 48 } };

  it("inserts an events row with no run, the Conductor as actor and the key that makes it once-only", async () => {
    const fake = withFake(() => ({ data: null, error: null }));
    expect(await new SupabaseWatchdogStore().escalate(event)).toBe("recorded");
    expect(fake.queries[0].table).toBe("events");
    expect(argsOf(fake.queries[0], "insert")).toEqual([
      { run_id: null, kind: "audit.overdue", payload: event.payload, actor: "conductor", idempotency_key: event.idempotencyKey },
    ]);
  });

  it("calls a unique violation a duplicate: already escalated", async () => {
    withFake(() => ({ data: null, error: { code: "23505", message: "duplicate key" } }));
    expect(await new SupabaseWatchdogStore().escalate(event)).toBe("duplicate");
  });

  it("throws on any other insert error", async () => {
    withFake(() => ({ data: null, error: { code: "42501", message: "permission denied for table events" } }));
    await expect(new SupabaseWatchdogStore().escalate(event)).rejects.toThrow(/escalation insert failed: permission denied/);
  });
});
