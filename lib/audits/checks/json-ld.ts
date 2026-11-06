import { htmlPages, type CrawlResult } from "../model";
import { finding, type Finding } from "../types";

/** Structured data (JSON-LD) blocks must be valid JSON, or search engines ignore them. */
export function checkJsonLd(crawl: CrawlResult): Finding[] {
  return htmlPages(crawl).flatMap(({ url, facts }) =>
    facts.jsonLd.flatMap((block, index) => {
      try {
        JSON.parse(block);
        return [];
      } catch (e) {
        return [
          finding({
            check: "page.json-ld",
            severity: "warn",
            url,
            key: `block-${index}`,
            message: "This page has structured data (the hidden details search engines use for things like opening hours and reviews) that is broken, so search engines will ignore it.",
            evidence: (e as Error).message.slice(0, 200),
          }),
        ];
      }
    }),
  );
}
