import { isSameSite } from "../fetcher";
import type { CrawlResult } from "../model";
import { parseSitemap } from "../sitemap";
import { finding, type Finding } from "../types";

/** A sitemap exists, parses, and lists only pages on this site that load. */
export function checkSitemap(crawl: CrawlResult): Finding[] {
  const { sitemaps, sitemapUrls } = crawl.site;
  const loaded = sitemaps.filter((s) => !s.fetch.error && s.fetch.status === 200);
  const findings: Finding[] = [];

  if (loaded.length === 0) {
    findings.push(
      finding({
        check: "site.sitemap",
        severity: "warn",
        url: sitemaps[0]?.url ?? new URL("/sitemap.xml", crawl.target).toString(),
        key: "missing",
        message: "Your site has no sitemap. A sitemap lists your pages so search engines find all of them.",
      }),
    );
    return findings;
  }

  for (const sitemap of loaded) {
    if (parseSitemap(sitemap.fetch.body).kind === null) {
      findings.push(
        finding({
          check: "site.sitemap",
          severity: "warn",
          url: sitemap.url,
          key: "invalid",
          message: "Your sitemap file can't be read. Search engines will ignore it until it's fixed.",
        }),
      );
    }
  }

  const target = new URL(crawl.target);
  const pagesByUrl = new Map(crawl.pages.map((p) => [p.url, p]));
  for (const listed of sitemapUrls) {
    let url: URL;
    try {
      url = new URL(listed);
    } catch {
      findings.push(
        finding({ check: "site.sitemap", severity: "warn", url: listed, key: "invalid-url", message: "Your sitemap lists an address that isn't a valid web address." }),
      );
      continue;
    }
    if (!isSameSite(target, url)) {
      findings.push(
        finding({
          check: "site.sitemap",
          severity: "warn",
          url: listed,
          key: "other-host",
          message: `Your sitemap lists a page on a different website (${url.host}). A sitemap should only list your own pages.`,
        }),
      );
      continue;
    }
    const page = pagesByUrl.get(url.toString());
    if (!page) continue; // not fetched within the page cap
    const fetch = page.fetch;
    if (fetch.error?.kind === "cross_host_redirect") continue; // reported by site.redirects
    if (fetch.error || fetch.status !== 200) {
      findings.push(
        finding({
          check: "site.sitemap",
          severity: "warn",
          url: listed,
          key: "not-ok",
          message: `Your sitemap lists a page that doesn't load (${fetch.error ? fetch.error.message : `status ${fetch.status}`}). Remove it from the sitemap or fix the page.`,
        }),
      );
    }
  }
  return findings;
}
