/**
 * @jest-environment node
 */
import { checkCanonical } from "../checks/canonical";
import { checkDescription } from "../checks/description";
import { checkHeadings } from "../checks/headings";
import { checkHttps } from "../checks/https";
import { checkImageAlt } from "../checks/images";
import { runChecks } from "../checks";
import { checkJsonLd } from "../checks/json-ld";
import { checkLang } from "../checks/lang";
import { checkLinks } from "../checks/links";
import { checkOpenGraph } from "../checks/open-graph";
import { checkRedirects } from "../checks/redirects";
import { checkRobots } from "../checks/robots";
import { checkSecurityHeaders } from "../checks/security-headers";
import { checkSitemap } from "../checks/sitemap";
import { checkSpeed } from "../checks/speed";
import { checkTitle } from "../checks/title";
import { checkViewport } from "../checks/viewport";
import { checkWww } from "../checks/www";
import { fingerprint, findingSchema, type Finding } from "../types";
import { cleanHtml, crawlOf, fetched, page, SITE } from "@/test-utils/audit";

const HOME = `${SITE}/`;
const one = (html: string) => crawlOf({ pages: [page(HOME, html)] });
const keys = (findings: Finding[]) => findings.map((f) => `${f.check}:${f.severity}`);

describe("a clean site", () => {
  it("produces no findings from any check", () => {
    expect(runChecks(crawlOf())).toEqual([]);
  });

  it("every finding any check produces is a valid Finding", () => {
    const messy = crawlOf({ pages: [page(HOME, "<html><body><img src=a.png><h1>a</h1><h1>b</h1></body></html>")] });
    for (const f of runChecks(messy)) expect(findingSchema.safeParse(f).success).toBe(true);
  });
});

describe("page.title", () => {
  const title = (t: string | null) => checkTitle(one(cleanHtml({ title: t })));
  it("fails when missing or empty", () => {
    expect(keys(title(null))).toEqual(["page.title:fail"]);
    expect(keys(title("   "))).toEqual(["page.title:fail"]);
  });
  it("accepts exactly 10 and exactly 60 characters", () => {
    expect(title("a".repeat(10))).toEqual([]);
    expect(title("a".repeat(60))).toEqual([]);
  });
  it("warns at 9 and at 61 characters, with different ids", () => {
    const short = title("a".repeat(9));
    const long = title("a".repeat(61));
    expect(keys(short)).toEqual(["page.title:warn"]);
    expect(keys(long)).toEqual(["page.title:warn"]);
    expect(short[0].id).not.toBe(long[0].id);
  });
  it("counts characters, not bytes, and collapses whitespace", () => {
    expect(title("Café Crème Brûlée")).toEqual([]);
    expect(title(`  Bistro\n\n   Example  `)).toEqual([]); // "Bistro Example" = 14
  });
});

describe("page.description", () => {
  const description = (d: string | null) => checkDescription(one(cleanHtml({ description: d })));
  it("warns when missing", () => expect(keys(description(null))).toEqual(["page.description:warn"]));
  it("accepts exactly 50 and exactly 160 characters", () => {
    expect(description("d".repeat(50))).toEqual([]);
    expect(description("d".repeat(160))).toEqual([]);
  });
  it("warns at 49 and 161 characters", () => {
    expect(keys(description("d".repeat(49)))).toEqual(["page.description:warn"]);
    expect(keys(description("d".repeat(161)))).toEqual(["page.description:warn"]);
  });
});

describe("page.h1", () => {
  const headings = (body: string) => checkHeadings(one(cleanHtml({ body })));
  it("accepts exactly one", () => expect(headings("<h1>One</h1><h2>Two</h2>")).toEqual([]));
  it("warns with none", () => expect(keys(headings("<h2>Only h2</h2>"))).toEqual(["page.h1:warn"]));
  it("warns with two, and says how many", () => {
    const [f] = headings("<h1>A</h1><h1>B</h1>");
    expect(f.message).toMatch(/2 main headings/);
  });
});

describe("page.lang and page.viewport", () => {
  it("warns without a lang attribute, including a blank one", () => {
    expect(keys(checkLang(one(cleanHtml({ lang: null }))))).toEqual(["page.lang:warn"]);
    expect(keys(checkLang(one(cleanHtml({ lang: " " }))))).toEqual(["page.lang:warn"]);
  });
  it("fails without a viewport meta tag", () => {
    expect(keys(checkViewport(one(cleanHtml({ viewport: false }))))).toEqual(["page.viewport:fail"]);
  });
});

describe("page.canonical", () => {
  const canonical = (c: string | null) => checkCanonical(one(cleanHtml({ canonical: c })));
  it("accepts an absolute same-site canonical", () => expect(canonical(`${SITE}/`)).toEqual([]));
  it("accepts a relative canonical, resolved against the page", () => expect(canonical("/")).toEqual([]));
  it("accepts the www variant of the same site", () => expect(canonical("https://www.bistro.example/")).toEqual([]));
  it("notes a missing canonical (info)", () => expect(keys(canonical(null))).toEqual(["page.canonical:info"]));
  it("warns on a canonical pointing at another site", () => {
    expect(keys(canonical("https://other.example/"))).toEqual(["page.canonical:warn"]);
  });
});

describe("page.open-graph", () => {
  it("notes each missing tag separately, at info level", () => {
    const findings = checkOpenGraph(one(cleanHtml({ og: { "og:image": null, "og:title": null } })));
    expect(findings.map((f) => f.severity)).toEqual(["info", "info"]);
    expect(findings.map((f) => f.message).join(" ")).toMatch(/og:title.*og:image/);
  });
});

describe("page.image-alt", () => {
  const images = (body: string) => checkImageAlt(one(cleanHtml({ body: `<h1>x</h1>${body}` })));
  it("accepts alt text and an empty alt (decorative)", () => {
    expect(images('<img src="/a.jpg" alt="Our dining room"><img src="/line.svg" alt="">')).toEqual([]);
  });
  it("warns once per image with no alt attribute", () => {
    const findings = images('<img src="/a.jpg"><img src="/b.jpg"><img src="/c.jpg" alt="">');
    expect(findings.map((f) => f.evidence)).toEqual(["/a.jpg", "/b.jpg"]);
    expect(new Set(findings.map((f) => f.id)).size).toBe(2);
  });
});

describe("page.json-ld", () => {
  const jsonLd = (script: string) => checkJsonLd(one(cleanHtml({ head: script })));
  it("accepts valid JSON-LD", () => {
    expect(jsonLd('<script type="application/ld+json">{"@type":"Restaurant","name":"Bistro"}</script>')).toEqual([]);
  });
  it("warns on malformed JSON-LD and ignores other script types", () => {
    const findings = jsonLd(
      '<script type="application/ld+json">{"@type": "Restaurant",}</script><script>not json at all</script>',
    );
    expect(keys(findings)).toEqual(["page.json-ld:warn"]);
  });
});

describe("site.https", () => {
  it("fails a site served over http", () => {
    const crawl = crawlOf({ target: "http://bistro.example/", pages: [page("http://bistro.example/", cleanHtml())], site: { httpVersion: null } });
    expect(keys(checkHttps(crawl))).toEqual(["site.https:fail"]);
  });
  it("fails when the http address doesn't redirect to https", () => {
    const crawl = crawlOf({ site: { httpVersion: fetched("http://bistro.example/") } });
    expect(keys(checkHttps(crawl))).toEqual(["site.https:fail"]);
  });
  it("notes when the http address doesn't answer at all", () => {
    const crawl = crawlOf({ site: { httpVersion: fetched("http://bistro.example/", { status: null, error: { kind: "network", message: "ECONNREFUSED" } }) } });
    expect(keys(checkHttps(crawl))).toEqual(["site.https:info"]);
  });
});

describe("site.redirects", () => {
  const hop = (n: number) => Array.from({ length: n }, (_, i) => ({ from: `${SITE}/${i}`, to: `${SITE}/${i + 1}`, status: 301 }));
  it("accepts a chain of 2 and warns at 3", () => {
    expect(checkRedirects(crawlOf({ pages: [page(HOME, cleanHtml(), { redirects: hop(2) })] }))).toEqual([]);
    expect(keys(checkRedirects(crawlOf({ pages: [page(HOME, cleanHtml(), { redirects: hop(3) })] })))).toEqual(["site.redirects:warn"]);
  });
  it("reports a redirect to another site, keyed by that host", () => {
    const moved = `${SITE}/moved`;
    const crawl = crawlOf({
      pages: [page(HOME, cleanHtml()), { url: moved, facts: null, fetch: fetched(moved, { status: 301, error: { kind: "cross_host_redirect", message: "x", location: "https://elsewhere.example/" } }) }],
    });
    const [f] = checkRedirects(crawl);
    expect(f).toMatchObject({ check: "site.redirects", severity: "warn", url: moved });
    expect(f.id).toBe(fingerprint("site.redirects", moved, "cross-host:elsewhere.example"));
  });
});

describe("site.www", () => {
  it("warns when both www and non-www serve the site", () => {
    const crawl = crawlOf({ site: { altHost: fetched("https://www.bistro.example/") } });
    expect(keys(checkWww(crawl))).toEqual(["site.www:warn"]);
  });
  it("accepts www redirecting to the main address", () => {
    const crawl = crawlOf({
      site: { altHost: fetched("https://www.bistro.example/", { finalUrl: HOME, redirects: [{ from: "https://www.bistro.example/", to: HOME, status: 301 }] }) },
    });
    expect(checkWww(crawl)).toEqual([]);
  });
  it("notes when the other variant doesn't load", () => {
    const crawl = crawlOf({ site: { altHost: fetched("https://www.bistro.example/", { status: null, error: { kind: "network", message: "ENOTFOUND" } }) } });
    expect(keys(checkWww(crawl))).toEqual(["site.www:info"]);
  });
});

describe("site.robots", () => {
  const robots = (body: string, status = 200) => checkRobots(crawlOf({ site: { robots: fetched(`${SITE}/robots.txt`, { body, status }) } }));
  it("notes a missing robots.txt (info)", () => expect(keys(robots("", 404))).toEqual(["site.robots:info"]));
  it("fails when it blocks the whole site", () => {
    expect(keys(robots("User-agent: *\nDisallow: /\n"))).toEqual(["site.robots:fail"]);
  });
  it("fails when it blocks Googlebot specifically", () => {
    expect(keys(robots("User-agent: Googlebot\nDisallow: /\n\nUser-agent: *\nAllow: /\n"))).toEqual(["site.robots:fail"]);
  });
  it("accepts blocking one folder, and an empty Disallow", () => {
    expect(robots("User-agent: *\nDisallow: /admin/\n")).toEqual([]);
    expect(robots("User-agent: *\nDisallow:\n")).toEqual([]);
  });
});

describe("site.sitemap", () => {
  const sitemapFetch = (body: string, status = 200) => [{ url: `${SITE}/sitemap.xml`, fetch: fetched(`${SITE}/sitemap.xml`, { body, status }) }];
  it("warns when there is no sitemap", () => {
    expect(keys(checkSitemap(crawlOf({ site: { sitemaps: sitemapFetch("", 404), sitemapUrls: [] } })))).toEqual(["site.sitemap:warn"]);
  });
  it("warns when it doesn't parse", () => {
    expect(keys(checkSitemap(crawlOf({ site: { sitemaps: sitemapFetch("<html>oops</html>"), sitemapUrls: [] } })))).toEqual(["site.sitemap:warn"]);
  });
  it("warns on listed URLs on another site and listed pages that don't load", () => {
    const gone = `${SITE}/gone`;
    const crawl = crawlOf({
      pages: [page(HOME, cleanHtml()), { url: gone, facts: null, fetch: fetched(gone, { status: 404 }) }],
      site: { sitemapUrls: [HOME, gone, "https://other.example/page"] },
    });
    const findings = checkSitemap(crawl);
    expect(findings.map((f) => f.url).sort()).toEqual([gone, "https://other.example/page"].sort());
    expect(findings.every((f) => f.severity === "warn")).toBe(true);
  });
});

describe("page.broken-link and site.start", () => {
  it("fails a linked page that returns 404, naming the pages that link to it", () => {
    const missing = `${SITE}/missing`;
    const crawl = crawlOf({
      pages: [page(HOME, cleanHtml()), { url: missing, facts: null, fetch: fetched(missing, { status: 404 }) }],
      linkedFrom: { [missing]: [HOME, `${SITE}/menu`] },
    });
    const [f] = checkLinks(crawl);
    expect(f).toMatchObject({ check: "page.broken-link", severity: "fail", url: missing });
    expect(f.evidence).toBe(`Linked from: ${HOME}, ${SITE}/menu`);
  });
  it("fails a homepage that doesn't load", () => {
    const crawl = crawlOf({ pages: [{ url: HOME, facts: null, fetch: fetched(HOME, { status: 500 }) }] });
    expect(keys(checkLinks(crawl))).toEqual(["site.start:fail"]);
  });
  it("warns on a linked page that times out", () => {
    const slow = `${SITE}/slow`;
    const crawl = crawlOf({
      pages: [page(HOME, cleanHtml()), { url: slow, facts: null, fetch: fetched(slow, { status: null, error: { kind: "timeout", message: "t" } }) }],
      linkedFrom: { [slow]: [HOME] },
    });
    expect(keys(checkLinks(crawl))).toEqual(["page.unreachable:warn"]);
  });
});

describe("a homepage that never answers", () => {
  it("reports only that the site is unreachable (Worth fixing), nothing it didn't check", () => {
    const crawl = crawlOf({ pages: [{ url: HOME, facts: null, fetch: fetched(HOME, { status: null, headers: {}, error: { kind: "network", message: "ENOTFOUND" } }) }] });
    crawl.homepageResponded = false;
    crawl.site = { httpVersion: null, altHost: null, robots: null, sitemaps: [], sitemapUrls: [] };
    const found = runChecks(crawl);
    expect(keys(found)).toEqual(["site.unreachable:warn"]);
    expect(found[0].message).toMatch(/^Site unreachable: .*ENOTFOUND/);
    expect(found[0].url).toBe(HOME);
  });
  it("is a different finding from a homepage that answers with an error", () => {
    const crawl = crawlOf({ pages: [page(HOME, "", { status: 503 })] });
    expect(keys(runChecks(crawl))).toContain("site.start:fail");
    expect(keys(runChecks(crawl))).not.toContain("site.unreachable:warn");
  });
});

describe("site.security-headers", () => {
  it("notes each missing header at info level only, never warn or fail", () => {
    const crawl = crawlOf({ pages: [page(HOME, cleanHtml(), { headers: { "content-type": "text/html" } })] });
    const findings = checkSecurityHeaders(crawl);
    expect(findings).toHaveLength(4);
    expect(new Set(findings.map((f) => f.severity))).toEqual(new Set(["info"]));
  });
  it("accepts a report-only CSP", () => {
    const headers = { ...fetched(HOME).headers, "content-security-policy": "", "content-security-policy-report-only": "default-src 'self'" };
    expect(checkSecurityHeaders(crawlOf({ pages: [page(HOME, cleanHtml(), { headers })] }))).toEqual([]);
  });
});

describe("page.slow", () => {
  const speed = (ttfbMs: number) => checkSpeed(crawlOf({ pages: [page(HOME, cleanHtml(), { ttfbMs })] }));
  it("is quiet at 1s, info above 1s, warn above 3s", () => {
    expect(speed(1000)).toEqual([]);
    expect(keys(speed(1001))).toEqual(["page.slow:info"]);
    expect(keys(speed(3000))).toEqual(["page.slow:info"]);
    expect(keys(speed(3001))).toEqual(["page.slow:warn"]);
  });
  it("keeps the same id whether it is info or warn", () => {
    expect(speed(1500)[0].id).toBe(speed(4000)[0].id);
  });
});
