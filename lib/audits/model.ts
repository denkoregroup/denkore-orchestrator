import type { FetchResult } from "./fetcher";
import type { PageFacts } from "./html";

/** How many times a page's time to first byte is measured. Odd, so there is a middle one. */
export const TTFB_SAMPLES = 3;

/** One crawled URL. */
export interface PageResult {
  /** The URL as queued: absolute, no fragment. */
  url: string;
  fetch: FetchResult;
  /**
   * Time to first byte of each measurement, in order: the page's own fetch, then more of the same
   * request, one after another. Empty when the page's own fetch failed. Shorter than TTFB_SAMPLES
   * when a repeat failed, which is not enough to judge.
   */
  ttfbSamplesMs: number[];
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
  /** null when the probes were skipped because the homepage got no response. */
  robots: FetchResult | null;
  sitemaps: SitemapFetch[];
  /** Every <loc> found in the sitemaps, in order, de-duplicated. */
  sitemapUrls: string[];
}

/** Everything the checks see. Checks are pure functions of this. */
export interface CrawlResult {
  target: string;
  /**
   * False when the homepage got no HTTP response at all (DNS, refused,
   * timeout, blocked). Then nothing else was fetched, and only that is reported.
   */
  homepageResponded: boolean;
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
