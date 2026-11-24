import "server-only";
import { requireOwner } from "@/lib/auth";
import { listOpenPulls, type PullSummary } from "@/lib/github/pulls";
import { getRegistry } from "@/lib/registry/cached";

export interface WaitingPull extends PullSummary {
  /** The registry id of the project this repo belongs to. */
  project: string;
}

export type WaitingData =
  | { configured: false }
  | {
      configured: true;
      pulls: WaitingPull[];
      /** Repos that couldn't be read, with the reason. */
      unreadable: Array<{ project: string; repo: string; error: string }>;
      projectCount: number;
    };

/** Every open PR across the registered projects' repos. Owner only. */
export async function getWaiting(): Promise<WaitingData> {
  await requireOwner();
  const token = process.env.GITHUB_READ_TOKEN;
  if (!token) return { configured: false };

  const entries = [...(await getRegistry()).values()];
  const projectOf = new Map(entries.map((e) => [e.repo, e.id]));
  const results = await listOpenPulls(fetch, token, entries.map((e) => e.repo));

  const pulls = results
    .flatMap((r) => r.pulls.map((p) => ({ ...p, project: projectOf.get(r.repo) ?? r.repo })))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const unreadable = results.flatMap((r) =>
    r.error ? [{ project: projectOf.get(r.repo) ?? r.repo, repo: r.repo, error: r.error }] : [],
  );
  return { configured: true, pulls, unreadable, projectCount: projectOf.size };
}
