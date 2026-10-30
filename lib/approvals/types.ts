import type { GateKind } from "@/lib/state-machine";
import type { GateReviewSummary } from "./schema";

export type ApprovalMode = "one_tap" | "pr_review";

export interface GateCheck {
  name: string;
  status: "passed" | "failed" | "pending";
}

/** What the owner sees at a gate. Business fields lead; technical detail is secondary. */
export interface GateReview {
  gateId: string;
  runId: string;
  project: string;
  kind: GateKind;
  approval: ApprovalMode;
  /** From the step output's result.gateReview; null when missing or invalid. Never invented. */
  summary: GateReviewSummary | null;
  technical: {
    /** The SHA shown to the owner, and the one the approval is recorded against. */
    commitSha: string;
    branch?: string;
    prUrl?: string;
    checks?: GateCheck[];
    filesChanged?: number;
    /** Total reported cost of the run so far, or null if no step reported one. */
    costUsd: number | null;
  };
}
