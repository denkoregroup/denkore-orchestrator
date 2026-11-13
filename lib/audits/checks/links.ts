import type { CrawlResult } from "../model";
import { finding, type Finding } from "../types";

/** Internal pages that fail to load, with the pages that link to them. */
export function checkLinks(crawl: CrawlResult): Finding[] {
  const findings: Finding[] = [];
  crawl.pages.forEach((page, index) => {
    const { fetch } = page;
    if (fetch.error?.kind === "cross_host_redirect") return; // reported by site.redirects
    const sources = crawl.linkedFrom[page.url] ?? [];
    const evidence = sources.length ? `Linked from: ${sources.join(", ")}` : undefined;

    // No answer at all (DNS, refused, timeout, blocked): the whole site is out of reach, so that is the
    // one thing reported (the crawl stops there). Worth fixing, not Needs fixing: from here it may be
    // our side of the network as much as theirs.
    if (index === 0 && !crawl.homepageResponded) {
      findings.push(
        finding({
          check: "site.unreachable",
          severity: "warn",
          url: page.url,
          message: "Site unreachable: we couldn't load your homepage. If this keeps happening, your site may be down or blocking automated visitors.",
          // The technical reason goes in evidence, not in the sentence the owner reads.
          evidence: fetch.error ? `Network error: ${fetch.error.message}` : "No answer",
        }),
      );
      return;
    }
    if (index === 0 && (fetch.error || (fetch.status !== null && fetch.status >= 400))) {
      findings.push(
        finding({
          check: "site.start",
          severity: "fail",
          url: page.url,
          message: `Your homepage doesn't load (${fetch.error ? fetch.error.message : `status ${fetch.status}`}).`,
        }),
      );
      return;
    }
    if (fetch.status !== null && fetch.status >= 400 && sources.length > 0) {
      findings.push(
        finding({
          check: "page.broken-link",
          severity: "fail",
          url: page.url,
          message: `A link on your site goes to a page that doesn't work (status ${fetch.status}). Fix or remove the link.`,
          evidence,
        }),
      );
      return;
    }
    if (fetch.error && sources.length > 0) {
      const reason =
        fetch.error.kind === "timeout"
          ? "it took too long to respond"
          : fetch.error.kind === "too_large"
            ? "it is too large to check"
            : "it couldn't be reached";
      findings.push(
        finding({
          check: "page.unreachable",
          severity: "warn",
          url: page.url,
          key: fetch.error.kind,
          message: `A page your site links to couldn't be checked: ${reason}.`,
          evidence: [fetch.error.message, evidence].filter(Boolean).join(". "),
        }),
      );
    }
  });
  return findings;
}
