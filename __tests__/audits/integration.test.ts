/**
 * @jest-environment node
 *
 * Real HTTP(S) servers on 127.0.0.1: a clean fixture site and a defective one
 * with one planted defect per check. allowLocal lets the fetcher reach them.
 */
import { createFetcher } from "@/lib/audits/fetcher";
import { runAudit } from "@/lib/audits/run";
import { auditReportSchema, fingerprint, type AuditReport } from "@/lib/audits/types";
import { cleanHtml } from "@/test-utils/audit";
import { makeTestCertificate, startServer, type FixtureServer, type Route, type Routes } from "@/test-utils/audit-servers";

jest.setTimeout(30_000);

const GOOD_HEADERS = {
  "strict-transport-security": "max-age=31536000",
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "content-security-policy": "default-src 'self'",
};

let tls: { key: string; cert: string };
const servers: FixtureServer[] = [];

beforeAll(() => {
  tls = makeTestCertificate();
});
afterAll(async () => {
  await Promise.all(servers.map((s) => s.close()));
});

/** An https site plus an http server for the http:// probe. Routes get the https origin. */
async function site(routes: (origin: string) => Routes, httpRoutes: (origin: string) => Routes) {
  let origin = "";
  const resolved: Routes = {};
  const secure = await startServer(
    new Proxy(resolved, { get: (_t, key: string) => routes(origin)[key] }),
    { tls },
  );
  origin = secure.origin;
  const plain = await startServer(httpRoutes(origin), { fallback: { status: 301, headers: { location: `${origin}/` } } });
  servers.push(secure, plain);
  return { origin, httpOrigin: plain.origin, secure, plain };
}

const audit = (target: string, httpOrigin: string) =>
  runAudit({
    url: `${target}/`,
    httpProbeUrl: `${httpOrigin}/`,
    fetcher: createFetcher({ allowLocal: true, proxy: null, ca: tls.cert, delayMs: 0 }),
  });

const pageRoute = (origin: string, path: string, parts: Parameters<typeof cleanHtml>[0] = {}, headers: Record<string, string> = GOOD_HEADERS): Route => ({
  headers,
  body: cleanHtml({ canonical: `${origin}${path}`, ...parts }),
});

// ---------------------------------------------------------------------------

function cleanRoutes(origin: string): Routes {
  const nav = '<h1>Bistro Example</h1><p>Welcome.</p><a href="/menu">Menu</a> <a href="/about#team">About</a>';
  return {
    "/": pageRoute(origin, "/", { body: nav }),
    "/menu": pageRoute(origin, "/menu", { title: "Menu | Bistro Example", body: '<h1>Menu</h1><img src="/dish.jpg" alt="Grilled fish"><a href="/">Home</a>' }),
    "/about": pageRoute(origin, "/about", { title: "About us | Bistro Example", body: '<h1>About</h1><img src="/divider.svg" alt="">' }),
    "/robots.txt": { headers: { "content-type": "text/plain" }, body: `User-agent: *\nDisallow: /admin\nSitemap: ${origin}/sitemap.xml\n` },
    "/sitemap.xml": {
      headers: { "content-type": "application/xml" },
      body: `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${origin}/</loc></url><url><loc>${origin}/menu</loc></url><url><loc>${origin}/about</loc></url></urlset>`,
    },
  };
}

function defectiveRoutes(origin: string): Routes {
  const links = [
    "/no-title", "/two-h1", "/missing", "/moved", "/slow", "/no-lang", "/no-viewport",
    "/bad-canonical", "/no-og-image", "/img-no-alt", "/bad-json-ld", "/chain",
  ].map((p) => `<a href="${p}">${p}</a>`).join(" ");
  const noHsts: Record<string, string> = { ...GOOD_HEADERS };
  delete noHsts["strict-transport-security"];
  const redirect = (to: string): Route => ({ status: 301, headers: { location: to } });
  return {
    // Missing HSTS; description too long.
    "/": pageRoute(origin, "/", { description: "d".repeat(170), body: `<h1>Bistro Example</h1>${links}` }, noHsts),
    "/no-title": pageRoute(origin, "/no-title", { title: null }),
    "/two-h1": pageRoute(origin, "/two-h1", { body: "<h1>One</h1><h1>Two</h1>" }),
    "/moved": redirect("https://elsewhere.example/new-home"),
    "/slow": { ...pageRoute(origin, "/slow"), delayMs: 1100 },
    "/no-lang": pageRoute(origin, "/no-lang", { lang: null }),
    "/no-viewport": pageRoute(origin, "/no-viewport", { viewport: false }),
    "/bad-canonical": pageRoute(origin, "/bad-canonical", { canonical: "https://other.example/page" }),
    "/no-og-image": pageRoute(origin, "/no-og-image", { og: { "og:image": null } }),
    "/img-no-alt": pageRoute(origin, "/img-no-alt", { body: '<h1>Gallery</h1><img src="/patio.jpg">' }),
    "/bad-json-ld": pageRoute(origin, "/bad-json-ld", { head: '<script type="application/ld+json">{"@type": "Restaurant",}</script>' }),
    "/chain": redirect("/chain-2"),
    "/chain-2": redirect("/chain-3"),
    "/chain-3": redirect("/final"),
    "/final": pageRoute(origin, "/final"),
    "/robots.txt": { headers: { "content-type": "text/plain" }, body: `User-agent: *\nDisallow: /private\nSitemap: ${origin}/sitemap.xml\n` },
    "/sitemap.xml": {
      headers: { "content-type": "application/xml" },
      body: `<urlset><url><loc>${origin}/</loc></url><url><loc>${origin}/gone</loc></url></urlset>`,
    },
  };
}

/** The defective site's http:// address serves the site instead of redirecting. */
const defectiveHttp = (origin: string): Routes => ({ "/": { headers: GOOD_HEADERS, body: cleanHtml({ canonical: `${origin}/` }) } });

// ---------------------------------------------------------------------------

describe("clean fixture site", () => {
  let report: AuditReport;
  beforeAll(async () => {
    const s = await site(cleanRoutes, () => ({}));
    report = await audit(s.origin, s.httpOrigin);
  });

  it("produces a valid report", () => {
    expect(auditReportSchema.safeParse(report).success).toBe(true);
    expect(report.pagesChecked).toBe(3);
  });

  it("has zero warn or fail findings", () => {
    expect(report.findings.filter((f) => f.severity !== "info")).toEqual([]);
    expect(report.counts.warn + report.counts.fail).toBe(0);
  });
});

describe("defective fixture site", () => {
  let report: AuditReport;
  let origin: string;
  let httpOrigin: string;
  beforeAll(async () => {
    const s = await site(defectiveRoutes, defectiveHttp);
    origin = s.origin;
    httpOrigin = s.httpOrigin;
    report = await audit(origin, httpOrigin);
  });

  const planted = () => [
    { defect: "http:// is served instead of redirecting", check: "site.https", severity: "fail", url: `${httpOrigin}/`, key: "no-redirect" },
    { defect: "description over 160 characters", check: "page.description", severity: "warn", url: `${origin}/`, key: "too-long" },
    { defect: "missing title", check: "page.title", severity: "fail", url: `${origin}/no-title`, key: "missing" },
    { defect: "two h1s", check: "page.h1", severity: "warn", url: `${origin}/two-h1`, key: "multiple" },
    { defect: "broken internal link", check: "page.broken-link", severity: "fail", url: `${origin}/missing`, key: "" },
    { defect: "sitemap lists a 404", check: "site.sitemap", severity: "warn", url: `${origin}/gone`, key: "not-ok" },
    { defect: "redirect to another host", check: "site.redirects", severity: "warn", url: `${origin}/moved`, key: "cross-host:elsewhere.example" },
    { defect: "redirect chain of 3", check: "site.redirects", severity: "warn", url: `${origin}/chain`, key: "long-chain" },
    { defect: "missing HSTS", check: "site.security-headers", severity: "info", url: `${origin}/`, key: "hsts" },
    { defect: "slow response (over 1s)", check: "page.slow", severity: "info", url: `${origin}/slow`, key: "" },
    { defect: "no html lang", check: "page.lang", severity: "warn", url: `${origin}/no-lang`, key: "" },
    { defect: "no viewport", check: "page.viewport", severity: "fail", url: `${origin}/no-viewport`, key: "" },
    { defect: "canonical on another host", check: "page.canonical", severity: "warn", url: `${origin}/bad-canonical`, key: "other-host" },
    { defect: "no og:image", check: "page.open-graph", severity: "info", url: `${origin}/no-og-image`, key: "og:image" },
    { defect: "image without alt", check: "page.image-alt", severity: "warn", url: `${origin}/img-no-alt`, key: "/patio.jpg" },
    { defect: "malformed JSON-LD", check: "page.json-ld", severity: "warn", url: `${origin}/bad-json-ld`, key: "block-0" },
  ];

  it("finds every planted defect, with exactly the expected id and severity", () => {
    const byId = new Map(report.findings.map((f) => [f.id, f]));
    for (const p of planted()) {
      const id = fingerprint(p.check, p.url, p.key);
      const found = byId.get(id);
      expect({ defect: p.defect, found: found ? { check: found.check, severity: found.severity } : null }).toEqual({
        defect: p.defect,
        found: { check: p.check, severity: p.severity },
      });
    }
  });

  it("reports nothing at warn or fail beyond the planted defects", () => {
    const expected = new Set(planted().filter((p) => p.severity !== "info").map((p) => fingerprint(p.check, p.url, p.key)));
    const actual = report.findings.filter((f) => f.severity !== "info");
    expect(actual.filter((f) => !expected.has(f.id))).toEqual([]);
  });

  it("names the page that links to the broken one", () => {
    const broken = report.findings.find((f) => f.check === "page.broken-link");
    expect(broken?.evidence).toBe(`Linked from: ${origin}/`);
  });

  it("is deterministic: a second run gives identical ids in identical order", async () => {
    const again = await audit(origin, httpOrigin);
    expect(again.findings.map((f) => f.id)).toEqual(report.findings.map((f) => f.id));
    expect(again.counts).toEqual(report.counts);
  });
});

describe("a start address that redirects", () => {
  it("reads the page it lands on once, not again when a link points back to it", async () => {
    const { origin, secure } = await site(
      (o) => ({
        "/start": { status: 301, headers: { location: `${o}/` } },
        "/": pageRoute(o, "/", { body: '<h1>Home</h1><a href="/">Home</a><a href="/about">About</a>' }),
        "/about": pageRoute(o, "/about", { body: '<h1>About</h1><a href="/">Home</a>' }),
      }),
      () => ({}),
    );
    const report = await runAudit({
      url: `${origin}/start`,
      httpProbeUrl: null, // the http:// probe would also land on "/"; leave it out
      fetcher: createFetcher({ allowLocal: true, proxy: null, ca: tls.cert, delayMs: 0 }),
    });
    // The landing page is fetched once as the redirect target, then twice more to measure its
    // response time. Linking back to it must not queue it a second time (that would be six).
    expect(secure.hits.filter((h) => h.path === "/")).toHaveLength(3);
    expect(report.pagesChecked).toBe(2);
  });
});

describe("response time is the median of three measurements", () => {
  /** The nth answer of /page waits delays[n] ms (the last one repeats); "hang" never answers. */
  async function auditWith(delays: Array<number | "hang">, timeoutMs = 10_000) {
    // Outside the routes: the fixture helper builds them again for every request.
    let calls = 0;
    const { origin, httpOrigin, secure } = await site(
      (o) => ({
        "/": pageRoute(o, "/", { body: '<h1>Home</h1><a href="/page">Page</a>' }),
        "/page": (): Route => {
          const delay = delays[Math.min(calls++, delays.length - 1)];
          return delay === "hang" ? { hang: true } : { ...pageRoute(o, "/page"), delayMs: delay };
        },
        "/robots.txt": { body: "User-agent: *\nAllow: /\n", headers: { "content-type": "text/plain" } },
      }),
      () => ({}),
    );
    const report = await runAudit({
      url: `${origin}/`,
      httpProbeUrl: `${httpOrigin}/`,
      fetcher: createFetcher({ allowLocal: true, proxy: null, ca: tls.cert, delayMs: 0, timeoutMs }),
    });
    return { report, secure, slowFindings: report.findings.filter((f) => f.check === "page.slow" && f.url === `${origin}/page`) };
  }

  it("measures every page three times, one after another", async () => {
    const { secure } = await auditWith([0]);
    expect(secure.hits.filter((h) => h.path === "/page")).toHaveLength(3);
  });

  it("slow, fast, fast: no finding", async () => {
    expect((await auditWith([1200, 0, 0])).slowFindings).toEqual([]);
  });

  it("slow, slow, fast: one finding, valued at the median", async () => {
    const { slowFindings } = await auditWith([1200, 1300, 0]);
    expect(slowFindings).toHaveLength(1);
    expect(slowFindings[0].evidence).toMatch(/^1[23]\d\d ms to first byte \(median of 3\)$/);
  });

  it("a repeat that fails leaves the page unjudged, even when its first answer was slow", async () => {
    const { slowFindings, report } = await auditWith([1200, "hang"], 400);
    expect(slowFindings).toEqual([]);
    expect(report.pagesChecked).toBe(2);
  });
});
