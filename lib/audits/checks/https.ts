import type { CrawlResult } from "../model";
import { finding, type Finding } from "../types";

/** The site uses https, and the http:// address sends visitors there. */
export function checkHttps(crawl: CrawlResult): Finding[] {
  const findings: Finding[] = [];
  const target = new URL(crawl.target);
  const start = crawl.pages[0]?.fetch;

  if (target.protocol === "http:" || (start && new URL(start.finalUrl).protocol === "http:")) {
    findings.push(
      finding({
        check: "site.https",
        severity: "fail",
        url: crawl.target,
        key: "not-secure",
        message: "Your website isn't using a secure connection (https). Browsers show visitors a “Not secure” warning.",
      }),
    );
  }

  const http = crawl.site.httpVersion;
  if (http) {
    if (http.error && http.error.kind !== "cross_host_redirect") {
      findings.push(
        finding({
          check: "site.https",
          severity: "info",
          url: http.url,
          key: "http-unreachable",
          message: `Typing ${new URL(http.url).host} without “https://” doesn't load your site. Most browsers add https for visitors, but some links and older devices won't.`,
          evidence: http.error.message,
        }),
      );
    } else if (http.status !== null && http.status < 400 && new URL(http.finalUrl).protocol === "http:") {
      findings.push(
        finding({
          check: "site.https",
          severity: "fail",
          url: http.url,
          key: "no-redirect",
          message: "Visitors who use the http:// address stay on the insecure version of your site instead of being sent to the secure https:// one.",
        }),
      );
    }
  }
  return findings;
}
