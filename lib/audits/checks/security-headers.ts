import type { CrawlResult } from "../model";
import { finding, type Finding } from "../types";

const HEADERS: Array<{ name: string; key: string; message: string }> = [
  {
    name: "strict-transport-security",
    key: "hsts",
    message: "Your server doesn't tell browsers to always use the secure version of your site (the HSTS setting). Your web host can turn this on.",
  },
  {
    name: "x-content-type-options",
    key: "x-content-type-options",
    message: "Your server is missing a small safety setting (X-Content-Type-Options) that stops browsers guessing file types. Your web host can add it.",
  },
  {
    name: "referrer-policy",
    key: "referrer-policy",
    message: "Your server doesn't say how much of your page addresses to share with other sites when visitors click away (Referrer-Policy). Your web host can add it.",
  },
  {
    name: "content-security-policy",
    key: "csp",
    message: "Your site has no Content-Security-Policy, an extra layer of protection against injected scripts. It's worth adding once your site is stable.",
  },
];

/** Recommended security headers on the homepage. Informational only: never warn or fail. */
export function checkSecurityHeaders(crawl: CrawlResult): Finding[] {
  const start = crawl.pages[0]?.fetch;
  if (!start || start.status === null || start.error) return [];
  return HEADERS.filter(({ name }) => {
    if (name === "content-security-policy") {
      return !start.headers["content-security-policy"] && !start.headers["content-security-policy-report-only"];
    }
    return !start.headers[name];
  }).map(({ key, message }) =>
    finding({ check: "site.security-headers", severity: "info", url: start.finalUrl, key, message }),
  );
}
