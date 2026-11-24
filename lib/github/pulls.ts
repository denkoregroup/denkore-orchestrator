/**
 * Open pull requests across the registered repos, read from GitHub's REST API.
 * Read-only: GET requests with a read-only token, nothing else.
 *
 * Checks are GitHub check runs only. Commit statuses are left out on purpose:
 * HoneyBee gets a "Vercel – honeybees" status from a second Vercel team that
 * fails on every commit, so counting statuses would mark every HoneyBee PR red.
 */

export const GITHUB_API = "https://api.github.com";

export type ChecksState = "passing" | "failing" | "running" | "none";

/** Where a PR stands from David's side: what, if anything, it waits on. */
export type PullStage = "ready" | "needs_fix" | "checks_running";

export interface PullSummary {
  repo: string;
  number: number;
  title: string;
  url: string;
  draft: boolean;
  author: string;
  /** Opened by an agent session: its body carries the Claude Code attribution line. */
  byAgent: boolean;
  headSha: string;
  updatedAt: string;
  checks: ChecksState;
  /** null while GitHub is still working it out. */
  conflicts: boolean | null;
  stage: PullStage;
}

export interface RepoPulls {
  repo: string;
  pulls: PullSummary[];
  /** Set when the repo couldn't be read; its pulls are then empty. */
  error: string | null;
  /** True when GitHub answered 404: the token wasn't given this repo, which is a choice, not a fault. */
  notShared: boolean;
}

type FetchFn = (url: string, init: RequestInit) => Promise<Response>;

const FAILED = new Set(["failure", "timed_out", "cancelled", "action_required", "startup_failure"]);
const AGENT_MARK = "Generated with [Claude Code]";

interface CheckRun {
  status: string;
  conclusion: string | null;
}

export function summarizeChecks(runs: CheckRun[]): ChecksState {
  if (runs.length === 0) return "none";
  if (runs.some((r) => r.conclusion !== null && FAILED.has(r.conclusion))) return "failing";
  if (runs.some((r) => r.status !== "completed")) return "running";
  return "passing";
}

export function stageOf(checks: ChecksState, conflicts: boolean | null): PullStage {
  if (checks === "failing" || conflicts === true) return "needs_fix";
  if (checks === "running") return "checks_running";
  return "ready";
}

class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function getJson(fetchFn: FetchFn, token: string, path: string): Promise<unknown> {
  const res = await fetchFn(`${GITHUB_API}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "denkore-orchestrator",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) {
    throw new GitHubError(
      res.status === 404 || res.status === 403
        ? `GitHub answered ${res.status}: the token can't see this repository`
        : `GitHub answered ${res.status}`,
      res.status,
    );
  }
  return res.json();
}

interface ListedPull {
  number: number;
  title: string;
  html_url: string;
  draft: boolean;
  user: { login: string } | null;
  body: string | null;
  head: { sha: string };
  updated_at: string;
}

async function summarizePull(fetchFn: FetchFn, token: string, repo: string, pull: ListedPull): Promise<PullSummary> {
  const [detail, checkRuns] = await Promise.all([
    getJson(fetchFn, token, `/repos/${repo}/pulls/${pull.number}`) as Promise<{ mergeable: boolean | null }>,
    getJson(fetchFn, token, `/repos/${repo}/commits/${pull.head.sha}/check-runs?per_page=100`) as Promise<{
      check_runs: CheckRun[];
    }>,
  ]);
  const checks = summarizeChecks(checkRuns.check_runs);
  const conflicts = detail.mergeable === null ? null : !detail.mergeable;
  return {
    repo,
    number: pull.number,
    title: pull.title,
    url: pull.html_url,
    draft: pull.draft,
    author: pull.user?.login ?? "unknown",
    byAgent: (pull.body ?? "").includes(AGENT_MARK),
    headSha: pull.head.sha,
    updatedAt: pull.updated_at,
    checks,
    conflicts,
    stage: stageOf(checks, conflicts),
  };
}

/** One repo's open PRs. A failure is returned as that repo's error, so one bad repo can't blank the page. */
export async function listRepoPulls(fetchFn: FetchFn, token: string, repo: string): Promise<RepoPulls> {
  try {
    const listed = (await getJson(fetchFn, token, `/repos/${repo}/pulls?state=open&per_page=50`)) as ListedPull[];
    const pulls = await Promise.all(listed.map((p) => summarizePull(fetchFn, token, repo, p)));
    return { repo, pulls, error: null, notShared: false };
  } catch (e) {
    const reason =
      e instanceof GitHubError ? e.message : e instanceof Error && e.name === "TimeoutError" ? "GitHub didn't answer in time" : "Couldn't reach GitHub";
    return { repo, pulls: [], error: reason, notShared: e instanceof GitHubError && e.status === 404 };
  }
}

export async function listOpenPulls(fetchFn: FetchFn, token: string, repos: readonly string[]): Promise<RepoPulls[]> {
  return Promise.all([...new Set(repos)].map((repo) => listRepoPulls(fetchFn, token, repo)));
}
