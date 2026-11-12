import type { FetchResult } from "@/lib/audits/fetcher";
import { extractFacts } from "@/lib/audits/html";
import { TTFB_SAMPLES, type CrawlResult, type PageResult, type SiteProbes } from "@/lib/audits/model";

export const SITE = "https://bistro.example";

export function fetched(url: string, overrides: Partial<FetchResult> = {}): FetchResult {
  return {
    url,
    finalUrl: url,
    status: 200,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "strict-transport-security": "max-age=31536000",
      "x-content-type-options": "nosniff",
      "referrer-policy": "strict-origin-when-cross-origin",
      "content-security-policy": "default-src 'self'",
    },
    body: "",
    ttfbMs: 50,
    redirects: [],
    error: null,
    ...overrides,
  };
}

/** A page that passes every page-level check; override any part. */
export function cleanHtml(parts: {
  lang?: string | null;
  title?: string | null;
  description?: string | null;
  viewport?: boolean;
  canonical?: string | null;
  og?: Partial<Record<"og:title" | "og:description" | "og:image", string | null>>;
  body?: string;
  head?: string;
} = {}): string {
  const lang = parts.lang === undefined ? "en" : parts.lang;
  const title = parts.title === undefined ? "Bistro Example | Dinner in Lewes" : parts.title;
  const description =
    parts.description === undefined
      ? "Seasonal dinners in Lewes, Delaware. See tonight's menu, opening hours, and book a table online."
      : parts.description;
  const canonical = parts.canonical === undefined ? `${SITE}/` : parts.canonical;
  const og = { "og:title": "Bistro Example", "og:description": "Seasonal dinners in Lewes.", "og:image": `${SITE}/og.jpg`, ...parts.og };
  return [
    "<!doctype html>",
    lang === null ? "<html>" : `<html lang="${lang}">`,
    "<head>",
    title === null ? "" : `<title>${title}</title>`,
    description === null ? "" : `<meta name="description" content="${description}">`,
    parts.viewport === false ? "" : '<meta name="viewport" content="width=device-width, initial-scale=1">',
    canonical === null ? "" : `<link rel="canonical" href="${canonical}">`,
    ...Object.entries(og).map(([p, v]) => (v === null ? "" : `<meta property="${p}" content="${v}">`)),
    parts.head ?? "",
    "</head>",
    `<body>${parts.body ?? "<h1>Bistro Example</h1><p>Welcome.</p>"}</body>`,
    "</html>",
  ].join("\n");
}

/**
 * A crawled page. Its time-to-first-byte measurements default to three equal ones taken from the
 * fetch's ttfbMs (none if that is null); pass `ttfbSamplesMs` to set them.
 */
export function page(url: string, html: string, fetchOverrides: Partial<FetchResult> = {}, ttfbSamplesMs?: number[]): PageResult {
  const fetch = fetched(url, { body: html, ...fetchOverrides });
  const samples = ttfbSamplesMs ?? (fetch.ttfbMs === null ? [] : Array.from({ length: TTFB_SAMPLES }, () => fetch.ttfbMs as number));
  return { url, fetch, ttfbSamplesMs: samples, facts: extractFacts(html) };
}

export function crawlOf(input: {
  pages?: PageResult[];
  site?: Partial<SiteProbes>;
  linkedFrom?: Record<string, string[]>;
  target?: string;
} = {}): CrawlResult {
  const target = input.target ?? `${SITE}/`;
  return {
    target,
    homepageResponded: true,
    pages: input.pages ?? [page(target, cleanHtml())],
    linkedFrom: input.linkedFrom ?? {},
    site: {
      httpVersion: fetched(target.replace(/^https:/, "http:"), {
        finalUrl: target,
        redirects: [{ from: target.replace(/^https:/, "http:"), to: target, status: 301 }],
      }),
      altHost: null,
      robots: fetched(`${SITE}/robots.txt`, { body: `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n` }),
      sitemaps: [
        {
          url: `${SITE}/sitemap.xml`,
          fetch: fetched(`${SITE}/sitemap.xml`, {
            body: `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${SITE}/</loc></url></urlset>`,
          }),
        },
      ],
      sitemapUrls: [`${SITE}/`],
      ...input.site,
    },
  };
}
