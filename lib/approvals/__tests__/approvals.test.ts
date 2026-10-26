/**
 * @jest-environment node
 */
import path from "node:path";
import { loadRegistry } from "@/lib/registry/loader";
import type { RegistryEntry } from "@/lib/registry/schema";
import { pendingGate, SHA_MOVED, SHA_SHOWN, step, VALID_GATE_REVIEW } from "@/test-utils/fixtures";
import {
  DECISION_MESSAGES,
  friendlyApprovalError,
  noteFor,
  PR_REVIEW_ATTESTATION,
  readDecisionForm,
} from "../decide";
import { toGateReview } from "../map";
import { approvalModeFor } from "../mode";
import { gateReviewSchema } from "../schema";

let example: RegistryEntry;
beforeAll(async () => {
  example = (await loadRegistry(path.join(process.cwd(), "registry"))).get("example-app")!;
});

describe("gateReviewSchema", () => {
  it("accepts a complete summary", () => {
    expect(gateReviewSchema.safeParse(VALID_GATE_REVIEW).success).toBe(true);
  });

  it("accepts empty change and risk lists", () => {
    expect(gateReviewSchema.safeParse({ ...VALID_GATE_REVIEW, changes: [], risks: [] }).success).toBe(true);
  });

  it.each(["headline", "summary", "changes", "risks"] as const)("rejects a summary missing %s", (field) => {
    const partial: Record<string, unknown> = { ...VALID_GATE_REVIEW };
    delete partial[field];
    expect(gateReviewSchema.safeParse(partial).success).toBe(false);
  });

  it("rejects a blank headline", () => {
    expect(gateReviewSchema.safeParse({ ...VALID_GATE_REVIEW, headline: "   " }).success).toBe(false);
  });
});

describe("approvalModeFor", () => {
  it("follows the registry entry's gates", () => {
    expect(approvalModeFor(example, "spec")).toBe("one_tap");
    expect(approvalModeFor(example, "design")).toBe("one_tap");
    expect(approvalModeFor(example, "release")).toBe("pr_review");
  });

  it("treats a project missing from the registry as PR review", () => {
    expect(approvalModeFor(undefined, "spec")).toBe("pr_review");
  });

  it("treats a gate listed in neither group as PR review", () => {
    expect(approvalModeFor({ ...example, gates: { oneTap: [], prReview: [] } }, "spec")).toBe("pr_review");
  });
});

describe("toGateReview", () => {
  it("uses the step output's summary and technical details", () => {
    const review = toGateReview(pendingGate(), example);
    expect(review.summary).toEqual(VALID_GATE_REVIEW);
    expect(review.technical).toMatchObject({
      commitSha: SHA_SHOWN,
      branch: "denkore/run-booking",
      prUrl: "https://github.com/denkoregroup/example-app/pull/42",
      filesChanged: 14,
      costUsd: 1.5,
    });
    expect(review.technical.checks).toBeUndefined();
  });

  it("leaves the summary empty when gateReview is missing, keeping technical details", () => {
    const review = toGateReview(pendingGate({ steps: [step({ output: { filesChanged: 3 } })] }), example);
    expect(review.summary).toBeNull();
    expect(review.technical.filesChanged).toBe(3);
    expect(review.technical.commitSha).toBe(SHA_SHOWN);
  });

  it("leaves the summary empty when gateReview is invalid", () => {
    const review = toGateReview(
      pendingGate({ steps: [step({ output: { gateReview: { headline: "Only a headline" } } })] }),
      example,
    );
    expect(review.summary).toBeNull();
  });

  it("leaves the summary empty when no step produced the gate", () => {
    expect(toGateReview(pendingGate({ steps: [] }), example).summary).toBeNull();
  });

  it("shows the gate's SHA even if the step reported another", () => {
    const review = toGateReview(pendingGate({ steps: [step({ commit_sha: SHA_MOVED })] }), example);
    expect(review.technical.commitSha).toBe(SHA_SHOWN);
  });

  it("is one-tap for a gate the registry lists as one-tap", () => {
    const review = toGateReview(pendingGate({ kind: "spec", steps: [step({ step: "spec" })] }), example);
    expect(review.approval).toBe("one_tap");
  });

  it("is PR review for a gate the registry lists as PR review", () => {
    expect(toGateReview(pendingGate({ kind: "release" }), example).approval).toBe("pr_review");
  });

  it("is PR review for a project that is not in the registry", () => {
    const review = toGateReview(pendingGate({ kind: "spec", registryId: "not-registered" }), undefined);
    expect(review.approval).toBe("pr_review");
  });

  it("reports no cost when no step reported one", () => {
    const review = toGateReview(pendingGate({ steps: [step({ cost_usd: null })] }), example);
    expect(review.technical.costUsd).toBeNull();
  });
});

describe("decision rules", () => {
  const form = (fields: Record<string, string>) => {
    const data = new FormData();
    for (const [k, v] of Object.entries(fields)) data.set(k, v);
    const parsed = readDecisionForm(data);
    if (!parsed.success) throw new Error("invalid form");
    return parsed.data;
  };
  const base = { gateId: "8b3e4d1a-6c5f-4e3a-9d9c-4f7a0b2c3d5e", commitSha: SHA_SHOWN };

  it("refuses a PR-review approval without the confirmation", () => {
    expect(noteFor(form({ ...base, decision: "approve" }), "pr_review")).toEqual({
      error: DECISION_MESSAGES.needsReview,
    });
  });

  it("stores the confirmation wording on a PR-review approval", () => {
    expect(noteFor(form({ ...base, decision: "approve", reviewed: "on" }), "pr_review")).toEqual({
      note: PR_REVIEW_ATTESTATION,
    });
  });

  it("allows a one-tap approval without the confirmation", () => {
    expect(noteFor(form({ ...base, decision: "approve" }), "one_tap")).toEqual({ note: null });
  });

  it("keeps an optional note when requesting changes, in either mode", () => {
    const changes = form({ ...base, decision: "request_changes", note: "  Use the brand colors.  " });
    expect(noteFor(changes, "pr_review")).toEqual({ note: "Use the brand colors." });
    expect(noteFor(changes, "one_tap")).toEqual({ note: "Use the brand colors." });
  });

  it("rejects a malformed SHA or decision", () => {
    const data = new FormData();
    data.set("gateId", base.gateId);
    data.set("commitSha", "HEAD");
    data.set("decision", "approve");
    expect(readDecisionForm(data).success).toBe(false);
  });
});

describe("friendlyApprovalError", () => {
  it.each([
    [{ code: "23514", message: `approval is for ${SHA_SHOWN}, but the gate now covers ${SHA_MOVED}` }, DECISION_MESSAGES.stale],
    [{ code: "23514", message: "gate is already approved" }, DECISION_MESSAGES.alreadyDecided],
    [{ code: "23514", message: "gate is already changes_requested" }, DECISION_MESSAGES.alreadyDecided],
    [{ code: "23503", message: "insert or update on table approvals violates foreign key constraint" }, DECISION_MESSAGES.stale],
    [{ code: "42501", message: "not the owner of this gate" }, DECISION_MESSAGES.notAllowed],
    [{ code: "42501", message: "new row violates row-level security policy for table approvals" }, DECISION_MESSAGES.notAllowed],
    [{ code: "08006", message: "connection failure" }, DECISION_MESSAGES.failed],
  ])("maps %o", (error, expected) => {
    expect(friendlyApprovalError(error)).toBe(expected);
  });
});
