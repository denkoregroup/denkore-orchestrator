import type { CrawlResult } from "../model";
import type { Finding } from "../types";
import { checkCanonical } from "./canonical";
import { checkDescription } from "./description";
import { checkHeadings } from "./headings";
import { checkHttps } from "./https";
import { checkImageAlt } from "./images";
import { checkJsonLd } from "./json-ld";
import { checkLang } from "./lang";
import { checkLinks } from "./links";
import { checkOpenGraph } from "./open-graph";
import { checkRedirects } from "./redirects";
import { checkRobots } from "./robots";
import { checkSecurityHeaders } from "./security-headers";
import { checkSitemap } from "./sitemap";
import { checkSpeed } from "./speed";
import { checkTitle } from "./title";
import { checkViewport } from "./viewport";
import { checkWww } from "./www";

export type Check = (crawl: CrawlResult) => Finding[];

/** Every check, in a fixed order. Each is a pure function of the crawl. */
export const CHECKS: readonly Check[] = [
  checkHttps,
  checkRedirects,
  checkWww,
  checkRobots,
  checkSitemap,
  checkLinks,
  checkSecurityHeaders,
  checkSpeed,
  checkTitle,
  checkDescription,
  checkHeadings,
  checkLang,
  checkViewport,
  checkCanonical,
  checkOpenGraph,
  checkImageAlt,
  checkJsonLd,
];

export function runChecks(crawl: CrawlResult): Finding[] {
  // If the homepage never answered, the only true finding is that it doesn't load.
  if (!crawl.homepageResponded) return checkLinks(crawl);
  return CHECKS.flatMap((check) => check(crawl));
}
