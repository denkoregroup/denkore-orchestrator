import { htmlPages, type CrawlResult } from "../model";
import { finding, type Finding } from "../types";

/** Every page has a viewport meta tag, so it fits phone screens. */
export function checkViewport(crawl: CrawlResult): Finding[] {
  return htmlPages(crawl).flatMap(({ url, facts }) =>
    facts.viewport
      ? []
      : [finding({ check: "page.viewport", severity: "fail", url, message: "This page isn't set up for phones: it will show as a tiny desktop page that visitors have to zoom into." })],
  );
}
