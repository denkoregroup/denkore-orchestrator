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
