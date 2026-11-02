import type { CrawlResult } from "../model";
import { parseRobots, isAllowed } from "../robots";
import { finding, type Finding } from "../types";

/** robots.txt exists and doesn't tell search engines to skip the whole site. */
export function checkRobots(crawl: CrawlResult): Finding[] {
  const robots = crawl.site.robots;
  if (robots.error || robots.status !== 200) {
    return [
      finding({
        check: "site.robots",
        severity: "info",
        url: robots.url,
        key: "missing",
        message: "Your site has no robots.txt file. It's optional, but it's the usual place to tell search engines where your sitemap is.",
        evidence: robots.error ? robots.error.message : `status ${robots.status}`,
      }),
    ];
  }
  const parsed = parseRobots(robots.body);
  if (!isAllowed(parsed, "*", "/") || !isAllowed(parsed, "Googlebot", "/")) {
    return [
      finding({
        check: "site.robots",
        severity: "fail",
        url: robots.url,
        key: "blocks-all",
        message: "Your robots.txt tells search engines not to look at any page of your site, so it won't show up in Google.",
      }),
    ];
  }
  return [];
}
