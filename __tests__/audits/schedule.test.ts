/**
 * @jest-environment node
 *
 * The daily job's logic against real HTTP servers: a working site, a dead one, and the real ingest
 * handler receiving what is posted.
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { createFetcher } from "@/lib/audits/fetcher";
import { buildPostRequest, parsePostUrl, postReport } from "@/lib/audits/post";
import { runAudit } from "@/lib/audits/run";
import { describeOutcome, runScheduledAudits, type ScheduleDeps, type ScheduledSite } from "@/lib/audits/schedule";
import { createReportHandler, MemoryReportStore } from "@/lib/site-health/ingest";
import { cleanHtml } from "@/test-utils/audit";
import { startServer, type FixtureServer } from "@/test-utils/audit-servers";
import { auditReport } from "@/test-utils/site-reports";

jest.setTimeout(60_000);

const SECRET = "schedule-test-secret-not-real";
const servers: Array<http.Server | FixtureServer> = [];
afterAll(async () => {
  await Promise.all(servers.map((s) => ("origin" in s ? s.close() : new Promise((resolve) => s.close(resolve)))));
});

/** The real ingest handler on a local server, with an in-memory store. */
async function ingest(respond?: (res: http.ServerResponse) => void) {
  const store = new MemoryReportStore({ "good-site": "7a2d3c0f-5b4e-4d2f-8c8b-3e6f9a1b2c4d", "dead-site": "8b3e4d1a-6c5f-4e3a-9d9c-4f7a0b2c3d5e" });
  const handle = createReportHandler({ secret: SECRET, store: () => store });
  const server = http.createServer(async (req, res) => {
    if (respond) return respond(res);
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
    const response = await handle(new Request(`http://localhost${req.url}`, { method: req.method, headers, body: Buffer.concat(chunks) }));
    res.writeHead(response.status, { "content-type": "application/json" });
    res.end(await response.text());
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  servers.push(server);
  return { url: parsePostUrl(`http://localhost:${(server.address() as AddressInfo).port}/api/audits/report`), store };
}

/** The job's real audit and post steps, with a fetcher that may reach the local fixture servers. */
function realDeps(reportUrl: URL): ScheduleDeps {
  return {
    audit: (site) =>
      runAudit({ url: site.url, httpProbeUrl: null, fetcher: createFetcher({ allowLocal: true, proxy: null, delayMs: 0, timeoutMs: 2_000 }) }),
    post: (site, report) => postReport(reportUrl, buildPostRequest({ report, registryId: site.registryId, secret: SECRET })),
  };
}

async function goodSite(): Promise<ScheduledSite> {
  const server = await startServer({
    "/": { body: cleanHtml({ canonical: undefined }) },
    "/robots.txt": { body: "User-agent: *\nAllow: /\n", headers: { "content-type": "text/plain" } },
  });
  servers.push(server);
  return { registryId: "good-site", url: `${server.origin}/` };
}

/** An address where nothing listens: a server that was started and then closed. */
async function deadSite(): Promise<ScheduledSite> {
  const server = await startServer({});
  const url = `${server.origin}/`;
  await server.close();
  return { registryId: "dead-site", url };
}

describe("runScheduledAudits", () => {
  it("one unreachable site among two posts two reports, and the job fails", async () => {
    const { url, store } = await ingest();
    // The dead site first, to show it doesn't stop the one after it.
    const { outcomes, failed } = await runScheduledAudits([await deadSite(), await goodSite()], realDeps(url));

    expect(store.reports).toHaveLength(2);
    expect(outcomes.map((o) => [o.registryId, o.status])).toEqual([
      ["dead-site", "unreachable"],
      ["good-site", "ok"],
    ]);
    expect(failed).toBe(1);

    // The unreachable site's report is a single "Site unreachable" finding, Worth fixing, so it shows on /sites.
    const dead = store.reports.find((r) => r.projectId === "8b3e4d1a-6c5f-4e3a-9d9c-4f7a0b2c3d5e")!;
    expect(dead.report.findings).toHaveLength(1);
    expect(dead.report.findings[0]).toMatchObject({ check: "site.unreachable", severity: "warn" });
    expect(dead.report.counts).toEqual({ info: 0, warn: 1, fail: 0 });
    // Each report is linked to its registry entry's project.
    expect(store.reports.every((r) => r.projectId !== null)).toBe(true);
  });

  it("is quiet when every site is fine", async () => {
    const { url, store } = await ingest();
    const { outcomes, failed } = await runScheduledAudits([await goodSite()], realDeps(url));
    expect(failed).toBe(0);
    expect(outcomes[0]).toMatchObject({ status: "ok", post: { status: "recorded", projectLinked: true } });
    expect(store.reports).toHaveLength(1);
  });

  it("an audit that crashes fails that site only", async () => {
    const posted: string[] = [];
    const { outcomes, failed } = await runScheduledAudits(
      [{ registryId: "a", url: "https://a.example" }, { registryId: "b", url: "https://b.example" }],
      {
        audit: async (site) => {
          if (site.registryId === "a") throw new Error("parser blew up");
          return auditReport();
        },
        post: async (site) => {
          posted.push(site.registryId);
          return { status: "recorded", projectLinked: true };
        },
      },
    );
    expect(posted).toEqual(["b"]);
    expect(outcomes[0]).toEqual({ registryId: "a", status: "failed", step: "audit", error: "parser blew up" });
    expect(outcomes[1]).toMatchObject({ registryId: "b", status: "ok" });
    expect(failed).toBe(1);
  });

  it("a report the app refuses fails that site only, with the app's answer", async () => {
    const { url, store } = await ingest();
    let posts = 0; // the first post is signed with the wrong secret, the rest correctly
    const { outcomes, failed } = await runScheduledAudits([await goodSite(), await goodSite()], {
      audit: realDeps(url).audit,
      post: (site, report) =>
        postReport(url, buildPostRequest({ report, registryId: site.registryId, secret: posts++ === 0 ? "wrong-secret-not-real" : SECRET })),
    });
    expect(outcomes[0]).toMatchObject({ status: "failed", step: "post" });
    expect((outcomes[0] as { error: string }).error).toMatch(/refused the report \(401\)/);
    expect((outcomes[0] as { error: string }).error).not.toContain("wrong-secret-not-real");
    expect(outcomes[1]).toMatchObject({ status: "ok" });
    expect(failed).toBe(1);
    expect(store.reports).toHaveLength(1);
  });

  it("an app that is down fails every site, and every site is still tried", async () => {
    const { url } = await ingest((res) => {
      res.writeHead(503);
      res.end("maintenance");
    });
    const { outcomes, failed } = await runScheduledAudits([await goodSite(), await goodSite()], realDeps(url));
    expect(outcomes.map((o) => o.status)).toEqual(["failed", "failed"]);
    expect(failed).toBe(2);
  });
});

describe("describeOutcome", () => {
  it("says what happened to each site, in one line", () => {
    const post = { status: "recorded", projectLinked: true } as const;
    expect(describeOutcome({ registryId: "a", status: "ok", findings: 4, post })).toBe("ok         a: stored, 4 findings");
    expect(describeOutcome({ registryId: "a", status: "ok", findings: 4, post: { ...post, status: "duplicate" } })).toContain("already stored");
    expect(describeOutcome({ registryId: "b", status: "unreachable", post })).toMatch(/^UNREACHABLE b: .*Site unreachable/);
    expect(describeOutcome({ registryId: "c", status: "failed", step: "post", error: "nope" })).toBe("FAILED     c: the report was not stored: nope");
    expect(describeOutcome({ registryId: "c", status: "failed", step: "audit", error: "nope" })).toBe("FAILED     c: the audit crashed: nope");
  });
});
