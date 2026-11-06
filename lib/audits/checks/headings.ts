import { htmlPages, type CrawlResult } from "../model";
import { finding, type Finding } from "../types";

/** Every page has exactly one main heading (h1). */
export function checkHeadings(crawl: CrawlResult): Finding[] {
  return htmlPages(crawl).flatMap(({ url, facts }) => {
    if (facts.h1Count === 0) {
      return [finding({ check: "page.h1", severity: "warn", url, key: "missing", message: "This page has no main heading. A clear main heading helps visitors and search engines understand the page." })];
    }
    if (facts.h1Count > 1) {
      return [finding({ check: "page.h1", severity: "warn", url, key: "multiple", message: `This page has ${facts.h1Count} main headings. Use one main heading and make the others smaller headings.`, evidence: `${facts.h1Count} <h1> elements` })];
    }
    return [];
  });
}
