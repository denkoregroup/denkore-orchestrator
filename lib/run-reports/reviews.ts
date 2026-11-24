/**
 * The Conductor review's verdicts on open agent PRs, as the Waiting on you page uses them.
 * Client-safe: types and pure helpers only.
 */
import type { ReviewVerdict } from "./schema";

export interface PullVerdict {
  verdict: ReviewVerdict;
  reason?: string;
  /** The commit the verdict is about. */
  headSha: string;
  /** When the review that gave it finished. */
  reviewedAt: string;
}

/** Verdicts keyed by reviewKey(repo, number). */
export type PullVerdicts = Record<string, PullVerdict>;

export function reviewKey(repo: string, number: number) {
  return `${repo.toLowerCase()}#${number}`;
}

/** The verdict that still holds for this PR: none when the PR was pushed after its review. */
export function currentVerdict(verdicts: PullVerdicts, pull: { repo: string; number: number; headSha: string }) {
  const v = verdicts[reviewKey(pull.repo, pull.number)];
  return v && v.headSha === pull.headSha ? v : undefined;
}
