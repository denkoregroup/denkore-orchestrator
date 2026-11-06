import { siteHostOf } from "../fetcher";
import type { CrawlResult } from "../model";
import { finding, type Finding } from "../types";

/** The www and non-www addresses should agree: one loads, the other sends visitors to it. */
export function checkWww(crawl: CrawlResult): Finding[] {
  const alt = crawl.site.altHost;
  const start = crawl.pages[0]?.fetch;
  if (!alt || !start || start.status !== 200) return [];

  const startHost = new URL(start.finalUrl).hostname;
  const altHost = new URL(alt.url).hostname;

  if (alt.error) {
    if (alt.error.kind === "cross_host_redirect") return [];
    return [
      finding({
        check: "site.www",
        severity: "info",
        url: alt.url,
        key: "unreachable",
        message: `${altHost} doesn't load. Some visitors type ${altHost.startsWith("www.") ? "“www”" : "the address without “www”"}; consider sending them to ${startHost}.`,
        evidence: alt.error.message,
      }),
    ];
  }

  const altFinal = new URL(alt.finalUrl).hostname;
  if (alt.status === 200 && altFinal !== startHost && siteHostOf(altFinal) === siteHostOf(startHost)) {
    return [
      finding({
        check: "site.www",
        severity: "warn",
        url: alt.url,
        key: "both-serve",
        message: `Your site loads at both ${startHost} and ${altFinal}. Pick one and redirect the other to it, so search engines don't treat them as two different sites.`,
      }),
    ];
  }
  return [];
}
