import { htmlPages, type CrawlResult } from "../model";
import { finding, type Finding } from "../types";

/** Every page says which language it is in. */
export function checkLang(crawl: CrawlResult): Finding[] {
  return htmlPages(crawl).flatMap(({ url, facts }) =>
    facts.lang
      ? []
      : [finding({ check: "page.lang", severity: "warn", url, message: "This page doesn't say what language it's written in. Screen readers and translation tools rely on that to read it correctly." })],
  );
}
