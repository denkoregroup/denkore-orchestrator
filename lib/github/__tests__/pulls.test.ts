/**
 * @jest-environment node
 */
import { listOpenPulls, listRepoPulls, stageOf, summarizeChecks } from "../pulls";

type Routes = Record<string, { status?: number; body: unknown }>;

function fakeFetch(routes: Routes) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fn = async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const path = url.replace("https://api.github.com", "");
    const route = routes[path];
    if (!route) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify(route.body), { status: route.status ?? 200 });
  };
  return { fn, calls };
}

const pull = (n: number, extra: Record<string, unknown> = {}) => ({
  number: n,
  title: `PR ${n}`,
  html_url: `https://github.com/o/r/pull/${n}`,
  draft: true,
  user: { login: "dclarktech302" },
  body: "Changes...\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)",
  head: { sha: `sha${n}` },
  updated_at: `2026-11-24T1${n}:00:00Z`,
  ...extra,
});

describe("summarizeChecks", () => {
  it("is none with no check runs", () => expect(summarizeChecks([])).toBe("none"));
  it("is failing when any run failed, even while others run", () =>
    expect(summarizeChecks([{ status: "in_progress", conclusion: null }, { status: "completed", conclusion: "failure" }])).toBe("failing"));
  it("is running while any run is unfinished", () =>
    expect(summarizeChecks([{ status: "queued", conclusion: null }, { status: "completed", conclusion: "success" }])).toBe("running"));
  it("counts skipped and neutral as passing", () =>
    expect(summarizeChecks([{ status: "completed", conclusion: "skipped" }, { status: "completed", conclusion: "neutral" }])).toBe("passing"));
});

describe("stageOf", () => {
  it("needs a fix on failing checks or conflicts", () => {
    expect(stageOf("failing", false)).toBe("needs_fix");
    expect(stageOf("passing", true)).toBe("needs_fix");
  });
  it("waits while checks run, and is ready otherwise (including no checks)", () => {
    expect(stageOf("running", null)).toBe("checks_running");
    expect(stageOf("passing", null)).toBe("ready");
    expect(stageOf("none", false)).toBe("ready");
  });
});

describe("listRepoPulls", () => {
  it("summarizes each open PR with its checks, conflicts and author", async () => {
    const { fn, calls } = fakeFetch({
      "/repos/o/r/pulls?state=open&per_page=50": { body: [pull(1), pull(2, { body: "by hand", user: { login: "ant" }, draft: false })] },
      "/repos/o/r/pulls/1": { body: { mergeable: true } },
      "/repos/o/r/pulls/2": { body: { mergeable: false } },
      "/repos/o/r/commits/sha1/check-runs?per_page=100": { body: { check_runs: [{ status: "completed", conclusion: "success" }] } },
      "/repos/o/r/commits/sha2/check-runs?per_page=100": { body: { check_runs: [] } },
    });
    const result = await listRepoPulls(fn, "tok", "o/r");
    expect(result.error).toBeNull();
    expect(result.pulls).toEqual([
      expect.objectContaining({ number: 1, byAgent: true, checks: "passing", conflicts: false, stage: "ready", draft: true }),
      expect.objectContaining({ number: 2, byAgent: false, author: "ant", checks: "none", conflicts: true, stage: "needs_fix" }),
    ]);
    // Read-only, authenticated, never cached.
    for (const c of calls) {
      expect(c.init.method).toBeUndefined();
      expect((c.init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
      expect(c.init.cache).toBe("no-store");
    }
  });

  it("treats mergeable null (GitHub still computing) as unknown, not a conflict", async () => {
    const { fn } = fakeFetch({
      "/repos/o/r/pulls?state=open&per_page=50": { body: [pull(1)] },
      "/repos/o/r/pulls/1": { body: { mergeable: null } },
      "/repos/o/r/commits/sha1/check-runs?per_page=100": { body: { check_runs: [] } },
    });
    expect((await listRepoPulls(fn, "tok", "o/r")).pulls[0]).toMatchObject({ conflicts: null, stage: "ready" });
  });

  it("returns a repo the token can't see as an error instead of throwing", async () => {
    const { fn } = fakeFetch({ "/repos/o/private/pulls?state=open&per_page=50": { status: 404, body: {} } });
    expect(await listRepoPulls(fn, "tok", "o/private")).toEqual({
      repo: "o/private",
      pulls: [],
      error: "GitHub answered 404: the token can't see this repository",
      notShared: true,
    });
  });

  it("treats any other refusal as an error, not as a repo left out", async () => {
    const { fn } = fakeFetch({ "/repos/o/r/pulls?state=open&per_page=50": { status: 403, body: {} } });
    expect(await listRepoPulls(fn, "tok", "o/r")).toMatchObject({ error: "GitHub answered 403: the token can't see this repository", notShared: false });
  });

  it("reports a network failure without leaking its details", async () => {
    const fn = async () => {
      throw new TypeError("fetch failed: getaddrinfo ENOTFOUND api.github.com");
    };
    expect((await listRepoPulls(fn, "tok", "o/r")).error).toBe("Couldn't reach GitHub");
  });
});

describe("listOpenPulls", () => {
  it("reads each repo once, even when two projects share it", async () => {
    const { fn, calls } = fakeFetch({ "/repos/o/r/pulls?state=open&per_page=50": { body: [] } });
    const result = await listOpenPulls(fn, "tok", ["o/r", "o/r"]);
    expect(result).toHaveLength(1);
    expect(calls).toHaveLength(1);
  });
});
