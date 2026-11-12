import { countBySeverity, finding, sortFindings, type AuditReport, type Finding } from "@/lib/audits/types";

export const TARGET = "https://example.com/";

/** A few findings with real ids, one per severity. */
export const findings = {
  noTitle: finding({ check: "page.title", severity: "warn", url: TARGET, message: "This page has no title." }),
  noDescription: finding({ check: "page.description", severity: "warn", url: TARGET, message: "This page has no description." }),
  noRobots: finding({ check: "site.robots", severity: "info", url: `${TARGET}robots.txt`, message: "Your site has no robots.txt file." }),
  brokenLink: finding({ check: "page.broken-link", severity: "fail", url: `${TARGET}gone`, message: "A link on your site goes to a page that is missing." }),
};

/** A valid schemaVersion 1 report; findings are sorted and counted the way the auditor does. */
export function auditReport(list: Finding[] = [], overrides: Partial<AuditReport> = {}): AuditReport {
  const sorted = sortFindings(list);
  return {
    schemaVersion: 1,
    target: TARGET,
    startedAt: "2026-11-01T10:00:00.000Z",
    finishedAt: "2026-11-01T10:01:00.000Z",
    pagesChecked: 3,
    findings: sorted,
    counts: countBySeverity(sorted),
    ...overrides,
  };
}

/**
 * Shaped like the first real report (www.denkore.com): 11 findings, two worth fixing and nine good
 * to know, the nine all on the home page. The messages are the auditor's own wording.
 */
export function denkoreFindings(): Finding[] {
  const home = "https://www.denkore.com/";
  const ogMessage = (what: string) =>
    `When this page is shared on social media or in a text message, the preview has no ${what} set. Add one so the preview looks right.`;
  return [
    finding({ check: "page.description", severity: "warn", url: home, key: "missing", message: "This page has no description. Google often shows the description under your link in search results, so write one or two sentences about the page." }),
    finding({ check: "site.sitemap", severity: "warn", url: `${home}sitemap.xml`, key: "missing", message: "Your site has no sitemap. A sitemap lists your pages so search engines find all of them." }),
    finding({ check: "page.canonical", severity: "info", url: home, key: "missing", message: "This page doesn't name its preferred address (a canonical link). It helps search engines when the same page is reachable at more than one address." }),
    finding({ check: "page.open-graph", severity: "info", url: home, key: "og:title", message: ogMessage("title (og:title)") }),
    finding({ check: "page.open-graph", severity: "info", url: home, key: "og:description", message: ogMessage("description (og:description)") }),
    finding({ check: "page.open-graph", severity: "info", url: home, key: "og:image", message: ogMessage("image (og:image)") }),
    finding({ check: "site.security-headers", severity: "info", url: home, key: "hsts", message: "Your server doesn't tell browsers to always use the secure version of your site (the HSTS setting). Your web host can turn this on." }),
    finding({ check: "site.security-headers", severity: "info", url: home, key: "x-content-type-options", message: "Your server is missing a small safety setting (X-Content-Type-Options) that stops browsers guessing file types. Your web host can add it." }),
    finding({ check: "site.security-headers", severity: "info", url: home, key: "referrer-policy", message: "Your server doesn't say how much of your page addresses to share with other sites when visitors click away (Referrer-Policy). Your web host can add it." }),
    finding({ check: "site.security-headers", severity: "info", url: home, key: "csp", message: "Your site has no Content-Security-Policy, an extra layer of protection against injected scripts. It's worth adding once your site is stable." }),
    finding({ check: "page.slow", severity: "info", url: home, key: "slow", message: "This page took 1.2 seconds before the server started sending it. Visitors may give up; your web host or site builder may be able to speed it up." }),
  ];
}

export const DENKORE_TARGET = "https://www.denkore.com/";
