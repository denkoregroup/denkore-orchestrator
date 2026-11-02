/**
 * @jest-environment node
 */
import { extractFacts } from "../html";
import { isAllowed, parseRobots } from "../robots";
import { parseSitemap } from "../sitemap";
import { countBySeverity, finding, fingerprint, normalizeUrl, sortFindings } from "../types";

describe("extractFacts", () => {
  it("reads the facts the checks need", () => {
    const facts = extractFacts(`<!doctype html><html lang="en-US"><head>
      <title>  Bistro
        Example </title>
      <meta name="Description" content="Dinner">
      <meta name="viewport" content="width=device-width">
      <link rel="alternate canonical" href="/menu">
      <meta property="og:title" content="Bistro">
      <script type="application/ld+json">{"a":1}</script>
      </head><body><h1>A</h1><img src="/a.png"><img src="/b.png" alt=""><a href="/menu#dinner">Menu</a><a>no href</a></body></html>`);
    expect(facts).toMatchObject({
      title: "Bistro Example",
      metaDescription: "Dinner",
      lang: "en-US",
      viewport: "width=device-width",
      canonical: "/menu",
      openGraph: { "og:title": "Bistro" },
      h1Count: 1,
      jsonLd: ['{"a":1}'],
      links: ["/menu#dinner"],
    });
    expect(facts.images).toEqual([
      { src: "/a.png", alt: null },
      { src: "/b.png", alt: "" },
    ]);
  });

  it("copes with broken HTML", () => {
    expect(extractFacts("<title>Unclosed<h1>x").title).toBe("Unclosed<h1>x");
    expect(extractFacts("").title).toBeNull();
  });
});

describe("robots", () => {
  const robots = parseRobots(`# comment
User-agent: *
Disallow: /admin
Allow: /admin/public
Disallow: /*.pdf$

User-agent: DenkoreAudit
Disallow: /no-audit

Sitemap: https://bistro.example/sitemap.xml`);

  it("applies the most specific matching rule", () => {
    expect(isAllowed(robots, "Googlebot", "/admin/x")).toBe(false);
    expect(isAllowed(robots, "Googlebot", "/admin/public/x")).toBe(true);
    expect(isAllowed(robots, "Googlebot", "/menu.pdf")).toBe(false);
    expect(isAllowed(robots, "Googlebot", "/menu.pdf?x=1")).toBe(true);
  });
  it("uses the group for our user agent when there is one", () => {
    expect(isAllowed(robots, "DenkoreAudit/1.0", "/admin")).toBe(true);
    expect(isAllowed(robots, "DenkoreAudit/1.0", "/no-audit/page")).toBe(false);
  });
  it("collects sitemap lines", () => expect(robots.sitemaps).toEqual(["https://bistro.example/sitemap.xml"]));
});

describe("parseSitemap", () => {
  it("reads a urlset with entities and CDATA", () => {
    expect(
      parseSitemap('<urlset><url><loc> https://a.example/?x=1&amp;y=2 </loc></url><url><loc><![CDATA[https://a.example/b]]></loc></url></urlset>'),
    ).toEqual({ kind: "urlset", locs: ["https://a.example/?x=1&y=2", "https://a.example/b"] });
  });
  it("reads a sitemap index", () => {
    expect(parseSitemap("<sitemapindex><sitemap><loc>https://a.example/s1.xml</loc></sitemap></sitemapindex>").kind).toBe("sitemapindex");
  });
  it("rejects a truncated or non-sitemap file", () => {
    expect(parseSitemap("<urlset><url><loc>https://a.example/</loc>").kind).toBeNull();
    expect(parseSitemap("<html></html>").kind).toBeNull();
  });
});

describe("finding ids", () => {
  it("are stable across equivalent URL spellings", () => {
    const a = fingerprint("page.title", "HTTPS://Bistro.Example:443/menu/?b=2&a=1#top");
    const b = fingerprint("page.title", "https://bistro.example/menu?a=1&b=2");
    expect(a).toBe(b);
    expect(normalizeUrl("https://bistro.example")).toBe("https://bistro.example/");
  });
  it("differ by check, URL and key", () => {
    const ids = new Set([
      fingerprint("page.title", "https://a.example/"),
      fingerprint("page.h1", "https://a.example/"),
      fingerprint("page.title", "https://a.example/menu"),
      fingerprint("page.title", "https://a.example/", "too-long"),
    ]);
    expect(ids.size).toBe(4);
  });
  it("are pinned: this exact value must never change, later slices diff runs by id", () => {
    // First 16 hex of sha256("page.title\nhttps://bistro.example/\nmissing"), checked with sha256sum.
    expect(fingerprint("page.title", "https://bistro.example/", "missing")).toBe("40e998fc88fa5c75");
  });
  it("sort fail, warn, info, then by check and URL, and drop duplicate ids", () => {
    const f = (check: string, severity: "info" | "warn" | "fail", url: string) => finding({ check, severity, url, message: "m" });
    const sorted = sortFindings([
      f("b", "info", "https://a.example/"),
      f("a", "warn", "https://a.example/z"),
      f("a", "warn", "https://a.example/b"),
      f("z", "fail", "https://a.example/"),
      f("z", "fail", "https://a.example/"),
    ]);
    expect(sorted.map((x) => `${x.severity}:${x.check}:${new URL(x.url).pathname}`)).toEqual(["fail:z:/", "warn:a:/b", "warn:a:/z", "info:b:/"]);
    expect(countBySeverity(sorted)).toEqual({ info: 1, warn: 2, fail: 1 });
  });
});
