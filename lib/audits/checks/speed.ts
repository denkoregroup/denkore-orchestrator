import { TTFB_SAMPLES, type CrawlResult } from "../model";
import { finding, type Finding } from "../types";

export const SLOW_INFO_MS = 1000;
export const SLOW_WARN_MS = 3000;

/** The middle value. With an odd number of samples it is one of them. */
export function medianMs(samples: number[]): number {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[(sorted.length - 1) / 2];
}

/**
 * Time until the server starts answering: info above 1s, warn above 3s. The page is judged on the
 * median of its measurements, so one slow answer (or one lucky fast one) doesn't change the finding.
 * A page without all its measurements (its fetch failed, or a repeat did) is not judged.
 */
export function checkSpeed(crawl: CrawlResult): Finding[] {
  const findings: Finding[] = [];
  for (const page of crawl.pages) {
    if (page.ttfbSamplesMs.length < TTFB_SAMPLES) continue;
    const ms = medianMs(page.ttfbSamplesMs);
    if (ms <= SLOW_INFO_MS) continue;
    const seconds = (ms / 1000).toFixed(1);
    findings.push(
      finding({
        check: "page.slow",
        severity: ms > SLOW_WARN_MS ? "warn" : "info",
        url: page.url,
        message: `This page took ${seconds} seconds before the server started sending it. Visitors may give up; your web host or site builder may be able to speed it up.`,
        evidence: `${Math.round(ms)} ms to first byte (median of ${page.ttfbSamplesMs.length})`,
      }),
    );
  }
  return findings;
}
