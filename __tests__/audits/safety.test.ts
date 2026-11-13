/**
 * @jest-environment node
 *
 * The fetcher's safety limits, against real local servers.
 */
import { createFetcher, isPrivateAddress, USER_AGENT } from "@/lib/audits/fetcher";
import { runAudit } from "@/lib/audits/run";
import { startConnectProxy, startServer, type FixtureServer } from "@/test-utils/audit-servers";
import { cleanHtml } from "@/test-utils/audit";

jest.setTimeout(20_000);

const servers: Array<{ close(): Promise<void> }> = [];
afterAll(async () => {
  await Promise.all(servers.map((s) => s.close()));
});
async function serve(...args: Parameters<typeof startServer>): Promise<FixtureServer> {
  const server = await startServer(...args);
  servers.push(server);
  return server;
}

const local = (options: Parameters<typeof createFetcher>[0] = {}) => createFetcher({ allowLocal: true, proxy: null, delayMs: 0, ...options });

describe("redirects", () => {
  it("does not follow a redirect to another host, and says where it was going", async () => {
    const other = await serve({ "/": { body: "<html>other</html>" } });
    const site = await serve({ "/": { status: 302, headers: { location: `http://localhost:${other.port}/` } } });

    const result = await local().fetch(`${site.origin}/`);
    expect(result.error).toMatchObject({ kind: "cross_host_redirect", location: `http://localhost:${other.port}/` });
    expect(result.status).toBe(302);
    expect(result.finalUrl).toBe(`${site.origin}/`);
    expect(other.hits).toHaveLength(0);
  });

  it("follows same-site redirects and records each hop", async () => {
    const site = await serve({ "/a": { status: 301, headers: { location: "/b" } }, "/b": { body: "ok" } });
    const result = await local().fetch(`${site.origin}/a`);
    expect(result).toMatchObject({ status: 200, finalUrl: `${site.origin}/b`, error: null, body: "ok" });
    expect(result.redirects).toEqual([{ from: `${site.origin}/a`, to: `${site.origin}/b`, status: 301 }]);
  });

  it("stops a redirect loop", async () => {
    const site = await serve({ "/loop": { status: 302, headers: { location: "/loop" } } });
    const result = await local({ maxRedirects: 3 }).fetch(`${site.origin}/loop`);
    expect(result.error?.kind).toBe("too_many_redirects");
    expect(site.hits.length).toBe(4);
  });
});

describe("private addresses", () => {
  it.each(["http://127.0.0.1:1/", "http://localhost:1/", "http://[::1]:1/", "http://10.0.0.1/", "http://169.254.169.254/latest/meta-data/", "http://192.168.1.1/", "http://printer.local/"])(
    "refuses %s without allowLocal, before connecting",
    async (url) => {
      const result = await createFetcher({ proxy: null, delayMs: 0 }).fetch(url);
      expect(result.error?.kind).toBe("private_address");
      expect(result.status).toBeNull();
    },
  );

  it("never reaches a local server without allowLocal", async () => {
    const site = await serve({ "/": { body: "secret" } });
    const result = await createFetcher({ proxy: null, delayMs: 0 }).fetch(`${site.origin}/`);
    expect(result.error?.kind).toBe("private_address");
    expect(site.hits).toHaveLength(0);
  });

  it("classifies the private and public addresses DNS could return", () => {
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.0.1", "169.254.1.1", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1"]) {
      expect([ip, isPrivateAddress(ip)]).toEqual([ip, true]);
    }
    for (const ip of ["93.184.216.34", "8.8.8.8", "172.32.0.1", "2606:4700::1111", "::ffff:8.8.8.8"]) {
      expect([ip, isPrivateAddress(ip)]).toEqual([ip, false]);
    }
  });

  it("the audit reports a refused local target as a homepage that doesn't load, and fetches nothing else", async () => {
    const site = await serve({ "/": { body: cleanHtml() } });
    const report = await runAudit({ url: `${site.origin}/`, fetcher: createFetcher({ proxy: null, delayMs: 0 }) });
    expect(report.findings.map((f) => f.check)).toEqual(["site.unreachable"]);
    expect(report.findings[0].severity).toBe("warn");
    expect(site.hits).toHaveLength(0);
  });
});

describe("limits", () => {
  it("holds the page cap", async () => {
    const links = Array.from({ length: 40 }, (_, i) => `<a href="/p${i}">p${i}</a>`).join("");
    const site = await serve({}, { fallback: { body: cleanHtml({ body: `<h1>x</h1>${links}` }) } });
    const report = await runAudit({ url: `${site.origin}/`, maxPages: 5, httpProbeUrl: null, fetcher: local() });
    expect(report.pagesChecked).toBe(5);
    // Five pages, each requested three times (its fetch and two more to measure its response time).
    const pageHits = site.hits.filter((h) => /^\/(p\d+)?$/.test(h.path));
    expect(new Set(pageHits.map((h) => h.path)).size).toBe(5);
    expect(pageHits).toHaveLength(5 * 3);
  });

  it("defaults to at most 25 pages", async () => {
    const links = Array.from({ length: 60 }, (_, i) => `<a href="/p${i}">p${i}</a>`).join("");
    const site = await serve({}, { fallback: { body: cleanHtml({ body: `<h1>x</h1>${links}` }) } });
    const report = await runAudit({ url: `${site.origin}/`, httpProbeUrl: null, fetcher: local() });
    expect(report.pagesChecked).toBe(25);
  });

  it("holds the size cap", async () => {
    const site = await serve({ "/big": { body: "x".repeat(50_000) } });
    const result = await local({ maxBytes: 10_000 }).fetch(`${site.origin}/big`);
    expect(result.error?.kind).toBe("too_large");
    expect(result.body).toBe("");
  });

  it("times out on a server that never answers", async () => {
    const site = await serve({ "/hang": { hang: true } });
    const started = Date.now();
    const result = await local({ timeoutMs: 300 }).fetch(`${site.origin}/hang`);
    expect(result.error?.kind).toBe("timeout");
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it("pauses between requests", async () => {
    const site = await serve({ "/": { body: "ok" } });
    const waits: number[] = [];
    let clock = 0;
    const fetcher = createFetcher({
      allowLocal: true,
      proxy: null,
      delayMs: 250,
      now: () => clock,
      sleep: async (ms) => {
        waits.push(ms);
        clock += ms;
      },
    });
    await fetcher.fetch(`${site.origin}/`);
    await fetcher.fetch(`${site.origin}/`);
    await fetcher.fetch(`${site.origin}/`);
    expect(waits).toEqual([250, 250]);
  });
});

describe("requests", () => {
  it("identifies itself with the DenkoreAudit user agent", async () => {
    const site = await serve({ "/": { body: "ok" } });
    await local().fetch(`${site.origin}/`);
    expect(site.hits[0].userAgent).toBe(USER_AGENT);
    expect(USER_AGENT).toBe("DenkoreAudit/1.0 (+https://www.denkore.com)");
  });

  it("tunnels through an HTTPS_PROXY-style CONNECT proxy unless NO_PROXY matches", async () => {
    const site = await serve({ "/": { body: "via proxy" } });
    const proxy = await startConnectProxy();
    servers.push(proxy);

    const proxied = await createFetcher({ allowLocal: true, proxy: proxy.url, noProxy: "", delayMs: 0 }).fetch(`${site.origin}/`);
    expect(proxied).toMatchObject({ status: 200, body: "via proxy" });
    expect(proxy.tunnels).toEqual([`127.0.0.1:${site.port}`]);

    const direct = await createFetcher({ allowLocal: true, proxy: proxy.url, noProxy: "localhost,127.0.0.0/8", delayMs: 0 }).fetch(`${site.origin}/`);
    expect(direct.status).toBe(200);
    expect(proxy.tunnels).toHaveLength(1);
  });

  it("really sends the request through the tunnel: a host only the proxy can resolve still loads", async () => {
    // "audit-fixture.invalid" does not resolve locally, so a direct connection would fail.
    const site = await serve({ "/": { body: "only via proxy" } });
    const proxy = await startConnectProxy({ "audit-fixture.invalid": "127.0.0.1" });
    servers.push(proxy);
    const url = `http://audit-fixture.invalid:${site.port}/`;

    const result = await createFetcher({ proxy: proxy.url, noProxy: "", delayMs: 0 }).fetch(url);
    expect(result).toMatchObject({ status: 200, body: "only via proxy", error: null });
    expect(proxy.tunnels).toEqual([`audit-fixture.invalid:${site.port}`]);
    expect(site.hits).toHaveLength(1);
  });

  it("still refuses a private target when a proxy is configured", async () => {
    const proxy = await startConnectProxy();
    servers.push(proxy);
    const result = await createFetcher({ proxy: proxy.url, noProxy: "", delayMs: 0 }).fetch("http://10.0.0.5/");
    expect(result.error?.kind).toBe("private_address");
    expect(proxy.tunnels).toHaveLength(0);
  });
});
