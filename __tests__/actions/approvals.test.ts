/**
 * @jest-environment node
 */
import { argsOf, createFakeSupabase, hasOp, type FakeQuery, type FakeResult } from "@/test-utils/fake-supabase";
import { IDS, SHA_MOVED, SHA_SHOWN } from "@/test-utils/fixtures";

const createClient = jest.fn();
const revalidatePath = jest.fn();

jest.mock("@/lib/auth", () => ({ requireOwner: jest.fn().mockResolvedValue({ id: "owner", email: null }) }));
jest.mock("@/lib/supabase/server", () => ({ createClient: () => createClient() }));
jest.mock("next/cache", () => ({ revalidatePath: (p: string) => revalidatePath(p) }));
const scheduleAdvance = jest.fn();
jest.mock("@/lib/conductor/schedule", () => ({ scheduleAdvance: (id: string) => scheduleAdvance(id) }));
// The sample project (example-app), not the real registry.
jest.mock("@/lib/registry/cached", () => ({
  getRegistry: async () => (await import("@/lib/registry/loader")).loadRegistry((await import("@/test-utils/registry")).EXAMPLE_REGISTRY_DIR),
}));

import { decideGateAction } from "@/app/(app)/approvals/actions";
import { DECISION_MESSAGES, INITIAL_DECISION_STATE, PR_REVIEW_ATTESTATION } from "@/lib/approvals/decide";

function db({
  kind = "release",
  registryId = "example-app",
  insertError = null,
}: {
  kind?: "spec" | "design" | "release";
  registryId?: string;
  insertError?: FakeResult["error"];
} = {}) {
  const fake = createFakeSupabase((q: FakeQuery) => {
    switch (q.table) {
      case "gates":
        // The gate has moved on in the database since the page was rendered.
        return { data: { id: IDS.gate, run_id: IDS.run, kind, commit_sha: SHA_MOVED }, error: null };
      case "runs":
        return { data: { project_id: IDS.project }, error: null };
      case "projects":
        return { data: { registry_id: registryId }, error: null };
      case "approvals":
        return { data: null, error: insertError };
      default:
        return { data: null, error: null };
    }
  });
  createClient.mockResolvedValue(fake.client);
  return fake;
}

function form(fields: Record<string, string>) {
  const data = new FormData();
  data.set("gateId", IDS.gate);
  data.set("commitSha", SHA_SHOWN);
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
}

const approvalInserts = (fake: ReturnType<typeof db>) =>
  fake.queries.filter((q) => q.table === "approvals" && hasOp(q, "insert"));

beforeEach(() => {
  createClient.mockReset();
  revalidatePath.mockClear();
  scheduleAdvance.mockClear();
});

describe("decideGateAction", () => {
  it("records the SHA that was displayed, not the gate's current one", async () => {
    const fake = db({ kind: "spec" });
    const state = await decideGateAction(INITIAL_DECISION_STATE, form({ decision: "approve" }));

    expect(state.status).toBe("success");
    const [insert] = approvalInserts(fake);
    expect(argsOf(insert, "insert")?.[0]).toEqual({
      gate_id: IDS.gate,
      commit_sha: SHA_SHOWN,
      decision: "approve",
      note: null,
    });
    expect(revalidatePath).toHaveBeenCalledWith("/approvals");
    expect(scheduleAdvance).toHaveBeenCalledWith(IDS.run);
  });

  it("never selects the gate's commit SHA on the server", async () => {
    const fake = db({ kind: "spec" });
    await decideGateAction(INITIAL_DECISION_STATE, form({ decision: "approve" }));
    for (const q of fake.queries.filter((query) => query.table === "gates")) {
      expect(String(argsOf(q, "select")?.[0])).not.toMatch(/commit_sha/);
    }
  });

  it("refuses a PR-review approval without the checkbox, and inserts nothing", async () => {
    const fake = db({ kind: "release" });
    const state = await decideGateAction(INITIAL_DECISION_STATE, form({ decision: "approve" }));
    expect(state).toEqual({ status: "error", gateId: IDS.gate, message: DECISION_MESSAGES.needsReview });
    expect(approvalInserts(fake)).toHaveLength(0);
    expect(scheduleAdvance).not.toHaveBeenCalled();
  });

  it("ignores a crafted form that claims one-tap for a PR-review gate", async () => {
    const fake = db({ kind: "release" });
    const state = await decideGateAction(
      INITIAL_DECISION_STATE,
      form({ decision: "approve", mode: "one_tap", approval: "one_tap" }),
    );
    expect(state.message).toBe(DECISION_MESSAGES.needsReview);
    expect(approvalInserts(fake)).toHaveLength(0);
  });

  it("stores the review wording with a confirmed PR-review approval", async () => {
    const fake = db({ kind: "release" });
    const state = await decideGateAction(INITIAL_DECISION_STATE, form({ decision: "approve", reviewed: "on" }));
    expect(state.status).toBe("success");
    expect(argsOf(approvalInserts(fake)[0], "insert")?.[0]).toMatchObject({
      commit_sha: SHA_SHOWN,
      note: PR_REVIEW_ATTESTATION,
    });
  });

  it("treats a project missing from the registry as PR review", async () => {
    db({ kind: "spec", registryId: "not-registered" });
    const state = await decideGateAction(INITIAL_DECISION_STATE, form({ decision: "approve" }));
    expect(state.message).toBe(DECISION_MESSAGES.needsReview);
  });

  it("allows request changes with a note on a PR-review gate without the checkbox", async () => {
    const fake = db({ kind: "release" });
    const state = await decideGateAction(
      INITIAL_DECISION_STATE,
      form({ decision: "request_changes", note: "Use the brand colors." }),
    );
    expect(state.status).toBe("success");
    expect(argsOf(approvalInserts(fake)[0], "insert")?.[0]).toMatchObject({
      decision: "request_changes",
      note: "Use the brand colors.",
    });
  });

  it.each([
    [`approval is for ${SHA_SHOWN}, but the gate now covers ${SHA_MOVED}`, "23514", DECISION_MESSAGES.stale],
    ["gate is already approved", "23514", DECISION_MESSAGES.alreadyDecided],
    ["not the owner of this gate", "42501", DECISION_MESSAGES.notAllowed],
    ["connection reset", undefined, DECISION_MESSAGES.failed],
  ])("maps the database error %p to a friendly message", async (message, code, expected) => {
    db({ kind: "spec", insertError: { message, code } });
    const state = await decideGateAction(INITIAL_DECISION_STATE, form({ decision: "approve" }));
    expect(state).toEqual({ status: "error", gateId: IDS.gate, message: expected });
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(scheduleAdvance).not.toHaveBeenCalled();
  });

  it("reports a gate that no longer exists as changed", async () => {
    const fake = createFakeSupabase(() => ({ data: null, error: null }));
    createClient.mockResolvedValue(fake.client);
    const state = await decideGateAction(INITIAL_DECISION_STATE, form({ decision: "approve" }));
    expect(state.message).toBe(DECISION_MESSAGES.stale);
  });

  it("rejects a tampered SHA before touching the database", async () => {
    const fake = db();
    const state = await decideGateAction(
      INITIAL_DECISION_STATE,
      form({ decision: "approve", commitSha: "not-a-sha" }),
    );
    expect(state.message).toBe(DECISION_MESSAGES.invalid);
    expect(fake.queries).toHaveLength(0);
  });
});
