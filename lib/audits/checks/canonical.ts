import { isSameSite } from "../fetcher";
import { htmlPages, type CrawlResult } from "../model";
import { finding, type Finding } from "../types";

/** Every page names its preferred address (canonical), on this site. Relative links are fine. */
export function checkCanonical(crawl: CrawlResult): Finding[] {
  return htmlPages(crawl).flatMap(({ url, facts }) => {
    if (!facts.canonical) {
      return [finding({ check: "page.canonical", severity: "info", url, key: "missing", message: "This page doesn't name its preferred address (a canonical link). It helps search engines when the same page is reachable at more than one address." })];
    }
    let canonical: URL;
    try {
      canonical = new URL(facts.canonical, url);
    } catch {
      return [finding({ check: "page.canonical", severity: "warn", url, key: "invalid", message: "This page's preferred address (canonical link) isn't a valid web address.", evidence: facts.canonical })];
    }
    if (!isSameSite(new URL(url), canonical)) {
      return [finding({ check: "page.canonical", severity: "warn", url, key: "other-host", message: `This page says its preferred address is on a different website (${canonical.host}), so search engines may show that site instead of yours.`, evidence: facts.canonical })];
    }
    return [];
  });
}
