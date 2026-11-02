import { htmlPages, type CrawlResult } from "../model";
import { finding, type Finding } from "../types";

export const TITLE_MIN = 10;
export const TITLE_MAX = 60;

/** Every page has a title of 10 to 60 characters. */
export function checkTitle(crawl: CrawlResult): Finding[] {
  return htmlPages(crawl).flatMap(({ url, facts }) => {
    const title = facts.title ?? "";
    const length = [...title].length;
    if (length === 0) {
      return [finding({ check: "page.title", severity: "fail", url, key: "missing", message: "This page has no title. The title is the headline people see in Google results and on browser tabs." })];
    }
    if (length < TITLE_MIN) {
      return [finding({ check: "page.title", severity: "warn", url, key: "too-short", message: `This page's title is very short (${length} characters). Describe the page in ${TITLE_MIN} to ${TITLE_MAX} characters, for example your business name and what the page is about.`, evidence: title })];
    }
    if (length > TITLE_MAX) {
      return [finding({ check: "page.title", severity: "warn", url, key: "too-long", message: `This page's title is long (${length} characters), so Google will cut it off. Keep it to ${TITLE_MAX} characters or fewer.`, evidence: title })];
    }
    return [];
  });
}
