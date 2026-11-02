import { htmlPages, type CrawlResult } from "../model";
import { finding, type Finding } from "../types";

const TAGS: Array<{ property: string; what: string }> = [
  { property: "og:title", what: "a title" },
  { property: "og:description", what: "a description" },
  { property: "og:image", what: "an image" },
];

/** Open Graph title, description and image, used for link previews on social media and in messages. */
export function checkOpenGraph(crawl: CrawlResult): Finding[] {
  return htmlPages(crawl).flatMap(({ url, facts }) =>
    TAGS.filter(({ property }) => !facts.openGraph[property]).map(({ property, what }) =>
      finding({
        check: "page.open-graph",
        severity: "info",
        url,
        key: property,
        message: `When this page is shared on social media or in a text message, the preview has no ${what.replace(/^an? /, "")} set (${property}). Add ${what} so the preview looks right.`,
      }),
    ),
  );
}
