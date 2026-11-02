/**
 * A minimal sitemap reader. It checks for a <urlset> or <sitemapindex> root
 * with its closing tag and collects <loc> values; it is not a full XML parser.
 */
export interface ParsedSitemap {
  kind: "urlset" | "sitemapindex" | null;
  locs: string[];
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function decode(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&(amp|lt|gt|quot|apos);/g, (_, name: string) => ENTITIES[name])
    .trim();
}

export function parseSitemap(xml: string): ParsedSitemap {
  const kind = /<urlset[\s>]/.test(xml) && /<\/urlset\s*>/.test(xml)
    ? "urlset"
    : /<sitemapindex[\s>]/.test(xml) && /<\/sitemapindex\s*>/.test(xml)
      ? "sitemapindex"
      : null;
  if (!kind) return { kind: null, locs: [] };
  const locs = [...xml.matchAll(/<loc>([\s\S]*?)<\/loc>/g)].map((m) => decode(m[1])).filter(Boolean);
  return { kind, locs };
}
