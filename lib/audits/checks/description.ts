import { htmlPages, type CrawlResult } from "../model";
import { finding, type Finding } from "../types";

export const DESCRIPTION_MIN = 50;
export const DESCRIPTION_MAX = 160;

/** Every page has a meta description of 50 to 160 characters. */
export function checkDescription(crawl: CrawlResult): Finding[] {
  return htmlPages(crawl).flatMap(({ url, facts }) => {
    const description = facts.metaDescription ?? "";
    const length = [...description].length;
    if (length === 0) {
      return [finding({ check: "page.description", severity: "warn", url, key: "missing", message: "This page has no description. Google often shows the description under your link in search results, so write one or two sentences about the page." })];
    }
    if (length < DESCRIPTION_MIN) {
      return [finding({ check: "page.description", severity: "warn", url, key: "too-short", message: `This page's description is short (${length} characters). Aim for ${DESCRIPTION_MIN} to ${DESCRIPTION_MAX} characters so it reads well in search results.`, evidence: description })];
    }
    if (length > DESCRIPTION_MAX) {
      return [finding({ check: "page.description", severity: "warn", url, key: "too-long", message: `This page's description is long (${length} characters), so Google will cut it off. Keep it to ${DESCRIPTION_MAX} characters or fewer.`, evidence: description })];
    }
    return [];
  });
}
