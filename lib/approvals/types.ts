import type { GateKind } from "@/lib/state-machine";

/** What the owner sees at a gate. Business fields lead; technical detail is secondary. */
export interface GateReview {
  id: string;
  project: string;
  kind: GateKind;
  approval: "one_tap" | "pr_review";
  /** One sentence, no jargon: what happens if this is approved. */
  headline: string;
  summary: string;
  changes: string[];
  risks: string[];
  technical: {
    commitSha: string;
    branch: string;
    prUrl?: string;
    checks: Array<{ name: string; status: "passed" | "failed" | "pending" }>;
    filesChanged: number;
    costUsd: number;
  };
}
