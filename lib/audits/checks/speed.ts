import type { CrawlResult } from "../model";
import { finding, type Finding } from "../types";

export const SLOW_INFO_MS = 1000;
export const SLOW_WARN_MS = 3000;

/** Time until the server starts answering: info above 1s, warn above 3s. */
export function checkSpeed(crawl: CrawlResult): Finding[] {
  const findings: Finding[] = [];
  for (const page of crawl.pages) {
    const ms = page.fetch.ttfbMs;
    if (ms === null || page.fetch.error || ms <= SLOW_INFO_MS) continue;
    const seconds = (ms / 1000).toFixed(1);
    findings.push(
      finding({
        check: "page.slow",
        severity: ms > SLOW_WARN_MS ? "warn" : "info",
        url: page.url,
        message: `This page took ${seconds} seconds before the server started sending it. Visitors may give up; your web host or site builder may be able to speed it up.`,
        evidence: `${Math.round(ms)} ms to first byte`,
      }),
    );
  }
  return findings;
}
