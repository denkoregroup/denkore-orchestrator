import { htmlPages, type CrawlResult } from "../model";
import { finding, type Finding } from "../types";

/** Images need an alt attribute. alt="" is fine: it marks a decorative image. */
export function checkImageAlt(crawl: CrawlResult): Finding[] {
  return htmlPages(crawl).flatMap(({ url, facts }) =>
    facts.images.flatMap((image, index) =>
      image.alt === null
        ? [
            finding({
              check: "page.image-alt",
              severity: "warn",
              url,
              key: image.src || `#${index}`,
              message: "An image on this page has no text description. People using screen readers can't tell what it shows, and search engines can't either.",
              evidence: image.src || `image ${index + 1} (no src)`,
            }),
          ]
        : [],
    ),
  );
}
