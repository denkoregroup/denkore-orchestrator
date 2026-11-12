import { isIP } from "node:net";
import { isSameSite, type Fetcher, type FetchResult, USER_AGENT } from "./fetcher";
import { extractFacts } from "./html";
import { TTFB_SAMPLES, type CrawlResult, type PageResult, type SitemapFetch } from "./model";
import { isAllowed, parseRobots, type Robots } from "./robots";
import { parseSitemap } from "./sitemap";
import { compareStrings } from "./types";

export const DEFAULT_MAX_PAGES = 25;
/** Child sitemaps followed from a sitemap index. */
const MAX_CHILD_SITEMAPS = 5;

export interface CrawlOptions {
  url: string;
  fetcher: Fetcher;
  maxPages?: number;
  /** Path prefixes not to crawl, e.g. ["/admin", "/cart"]. */
  ignorePaths?: string[];
  /**
   * The http:// address to probe for the https redirect. Defaults to the
   * target with http and no port; tests pass their own port. null skips it.
   */
  httpProbeUrl?: string | null;
}

/** Strips the fragment; returns null for anything that isn't an http(s) URL. */
function resolveLink(href: string, base: string): URL | null {
  if (/^(mailto|tel|javascript|data|sms):/i.test(href)) return null;
  try {
    const url = new URL(href, base);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

function isHtml(fetch: FetchResult): boolean {
  return (fetch.headers["content-type"] ?? "").toLowerCase().includes("html");
}

function isDomainName(hostname: string): boolean {
  return !isIP(hostname.replace(/^\[|\]$/g, "")) && hostname.includes(".") && !hostname.endsWith(".localhost");
}

function altHostUrl(target: URL): string {
  const alt = new URL("/", target);
  alt.hostname = target.hostname.startsWith("www.") ? target.hostname.slice(4) : `www.${target.hostname}`;
  return alt.toString();
}

/**
 * Fetches the target, its http:// and www counterparts, robots.txt and the
 * sitemap, then follows same-site links breadth-first up to the page cap.
 * Everything runs one request at a time, so the order is deterministic.
 */
export async function crawl(options: CrawlOptions): Promise<CrawlResult> {
  const { fetcher } = options;
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  const ignorePaths = options.ignorePaths ?? [];
  const target = new URL(options.url);
  target.hash = "";

  const start = await fetcher.fetch(target.toString());
  if (start.status === null) {
    // No response at all: probing robots, sitemap or http:// would only report the same outage again.
    return {
      target: target.toString(),
      homepageResponded: false,
      site: { httpVersion: null, altHost: null, robots: null, sitemaps: [], sitemapUrls: [] },
      pages: [{ url: target.toString(), fetch: start, ttfbSamplesMs: [], facts: null }],
      linkedFrom: {},
    };
  }
  // Robots and sitemap live on the host the homepage settled on (e.g. www).
  const finalStart = new URL(start.finalUrl);
  const base = isSameSite(target, finalStart) ? finalStart : target;

  let httpVersion: FetchResult | null = null;
  if (target.protocol === "https:" && options.httpProbeUrl !== null) {
    const probe = options.httpProbeUrl ?? (() => {
      const url = new URL(target);
      url.protocol = "http:";
      url.port = "";
      return url.toString();
    })();
    httpVersion = await fetcher.fetch(probe);
  }
  const altHost = isDomainName(target.hostname) ? await fetcher.fetch(altHostUrl(base)) : null;

  const robotsFetch = await fetcher.fetch(new URL("/robots.txt", base).toString());
  const robots: Robots = robotsFetch.status === 200 && !robotsFetch.error ? parseRobots(robotsFetch.body) : { groups: [], sitemaps: [] };

  // Sitemaps: the ones robots.txt names on this site, else /sitemap.xml.
  const named = robots.sitemaps.map((s) => resolveLink(s, base.toString())).filter((u): u is URL => u !== null && isSameSite(target, u));
  const sitemapQueue = named.length > 0 ? named.map((u) => u.toString()) : [new URL("/sitemap.xml", base).toString()];
  const sitemaps: SitemapFetch[] = [];
  const sitemapUrls: string[] = [];
  const seenLocs = new Set<string>();
  let children = 0;
  while (sitemapQueue.length > 0) {
    const url = sitemapQueue.shift()!;
    const fetch = await fetcher.fetch(url);
    sitemaps.push({ url, fetch });
    if (fetch.error || fetch.status !== 200) continue;
    const parsed = parseSitemap(fetch.body);
    for (const loc of parsed.locs) {
      if (parsed.kind === "sitemapindex") {
        const child = resolveLink(loc, url);
        if (child && isSameSite(target, child) && children < MAX_CHILD_SITEMAPS) {
          children++;
          sitemapQueue.push(child.toString());
        }
      } else if (!seenLocs.has(loc)) {
        seenLocs.add(loc);
        sitemapUrls.push(loc);
      }
    }
  }

  // Breadth-first crawl.
  const pages: PageResult[] = [];
  const linkedFrom = new Map<string, Set<string>>();
  const queued = new Set<string>([target.toString()]);
  const queue: string[] = [];

  const shouldCrawl = (url: URL) =>
    isSameSite(target, url) &&
    !ignorePaths.some((prefix) => url.pathname.startsWith(prefix)) &&
    isAllowed(robots, USER_AGENT, url.pathname + url.search);

  const enqueue = (url: URL) => {
    const key = url.toString();
    if (queued.has(key) || !shouldCrawl(url)) return;
    queued.add(key);
    queue.push(key);
  };

  /**
   * The page's own fetch is the first measurement of its time to first byte; the same request is
   * repeated, one after another, for the rest. One slow answer then can't decide the finding.
   */
  const measureTtfb = async (url: string, first: FetchResult): Promise<number[]> => {
    if (first.error || first.ttfbMs === null) return [];
    const samples = [first.ttfbMs];
    while (samples.length < TTFB_SAMPLES) {
      const again = await fetcher.fetch(url);
      if (again.error || again.ttfbMs === null) break; // a failed repeat leaves too few to judge
      samples.push(again.ttfbMs);
    }
    return samples;
  };

  const record = async (url: string, fetch: FetchResult) => {
    const loaded = fetch.status === 200 && !fetch.error && isHtml(fetch) && isSameSite(target, new URL(fetch.finalUrl));
    const result: PageResult = { url, fetch, ttfbSamplesMs: await measureTtfb(url, fetch), facts: loaded ? extractFacts(fetch.body) : null };
    pages.push(result);
    // A page that redirected (e.g. the apex to www) is already read at its
    // final address; don't queue that address again when a link points to it.
    queued.add(new URL(fetch.finalUrl).toString());
    for (const href of result.facts?.links ?? []) {
      const link = resolveLink(href, fetch.finalUrl);
      if (!link || !isSameSite(target, link)) continue;
      const key = link.toString();
      if (!linkedFrom.has(key)) linkedFrom.set(key, new Set());
      linkedFrom.get(key)!.add(url);
      enqueue(link);
    }
  };

  await record(target.toString(), start);
  for (const loc of sitemapUrls) {
    const url = resolveLink(loc, base.toString());
    if (url) enqueue(url);
  }
  while (queue.length > 0 && pages.length < maxPages) {
    const url = queue.shift()!;
    await record(url, await fetcher.fetch(url));
  }

  return {
    target: target.toString(),
    homepageResponded: true,
    site: { httpVersion, altHost, robots: robotsFetch, sitemaps, sitemapUrls },
    pages,
    linkedFrom: Object.fromEntries(
      [...linkedFrom.entries()].map(([url, sources]) => [url, [...sources].sort(compareStrings)]),
    ),
  };
}
