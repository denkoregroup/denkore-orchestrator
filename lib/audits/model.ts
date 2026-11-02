import type { FetchResult } from "./fetcher";
import type { PageFacts } from "./html";

/** One crawled URL. */
export interface PageResult {
  /** The URL as queued: absolute, no fragment. */
  url: string;
  fetch: FetchResult;
  /** Present only for a same-site HTML page that loaded (status 200). */
  facts: PageFacts | null;
}

export interface SitemapFetch {
  url: string;
  fetch: FetchResult;
}

/** Site-level requests made before the crawl. */
export interface SiteProbes {
  /** The http:// version of the target; null when the target is already http. */
  httpVersion: FetchResult | null;
  /** The www / non-www counterpart; null for IP addresses and localhost. */
  altHost: FetchResult | null;
  robots: FetchResult;
  sitemaps: SitemapFetch[];
  /** Every <loc> found in the sitemaps, in order, de-duplicated. */
  sitemapUrls: string[];
}

/** Everything the checks see. Checks are pure functions of this. */
export interface CrawlResult {
  target: string;
  site: SiteProbes;
  /** pages[0] is the target itself. */
  pages: PageResult[];
  /** For every same-site link target: the pages that link to it, sorted. */
  linkedFrom: Record<string, string[]>;
}

/** Same-site HTML pages that loaded, with their facts. */
export function htmlPages(crawl: CrawlResult): Array<PageResult & { facts: PageFacts }> {
  return crawl.pages.filter((p): p is PageResult & { facts: PageFacts } => p.facts !== null);
}
