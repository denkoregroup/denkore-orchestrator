import type { FetchResult } from "../fetcher";
import type { CrawlResult } from "../model";
import { finding, type Finding } from "../types";

export const MAX_REDIRECT_HOPS = 2;

function allFetches(crawl: CrawlResult): FetchResult[] {
  const { site } = crawl;
  return [
    ...(site.httpVersion ? [site.httpVersion] : []),
    ...crawl.pages.map((p) => p.fetch),
    ...(site.altHost ? [site.altHost] : []),
  ];
}

/** Redirect chains that are too long, and redirects that leave the site. */
export function checkRedirects(crawl: CrawlResult): Finding[] {
  const findings: Finding[] = [];
  for (const fetch of allFetches(crawl)) {
    if (fetch.redirects.length > MAX_REDIRECT_HOPS) {
      findings.push(
        finding({
          check: "site.redirects",
          severity: "warn",
          url: fetch.url,
          key: "long-chain",
          message: `This address bounces visitors through ${fetch.redirects.length} redirects before the page loads, which slows it down. Point it straight at the final address.`,
          evidence: [fetch.url, ...fetch.redirects.map((r) => `${r.status} ${r.to}`)].join(" -> "),
        }),
      );
    }
    if (fetch.error?.kind === "cross_host_redirect") {
      const location = fetch.error.location ?? "";
      let host = location;
      try {
        host = new URL(location).host;
      } catch {
        // keep the raw value
      }
      findings.push(
        finding({
          check: "site.redirects",
          severity: "warn",
          url: fetch.url,
          key: `cross-host:${host}`,
          message: `This address sends visitors to a different website (${host}). If that isn't intended, fix the redirect or the link.`,
          evidence: location,
        }),
      );
    }
  }
  return findings;
}
