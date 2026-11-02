import { runChecks } from "./checks";
import { crawl, type CrawlOptions } from "./crawl";
import { createFetcher, type Fetcher } from "./fetcher";
import { auditReportSchema, countBySeverity, sortFindings, type AuditReport, type Finding, type Severity } from "./types";

export interface RunAuditOptions extends Omit<CrawlOptions, "fetcher"> {
  /** Defaults to the real network fetcher. Tests inject their own. */
  fetcher?: Fetcher;
  now?: () => Date;
}

/** Crawl, run every check, and build a validated report. No model calls. */
export async function runAudit(options: RunAuditOptions): Promise<AuditReport> {
  const now = options.now ?? (() => new Date());
  const target = new URL(options.url);
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    throw new Error(`Only http and https addresses can be audited: ${options.url}`);
  }
  const startedAt = now().toISOString();
  const result = await crawl({ ...options, fetcher: options.fetcher ?? createFetcher() });
  const findings = sortFindings(runChecks(result));
  return auditReportSchema.parse({
    schemaVersion: 1,
    target: result.target,
    startedAt,
    finishedAt: now().toISOString(),
    pagesChecked: result.pages.length,
    findings,
    counts: countBySeverity(findings),
  });
}

const HEADINGS: Record<Severity, string> = {
  fail: "Needs fixing",
  warn: "Worth fixing",
  info: "Good to know",
};

/** A short plain-language summary, grouped by severity. */
export function summarize(report: AuditReport): string {
  const { counts } = report;
  const lines = [
    `Audit of ${report.target}`,
    `${report.pagesChecked} page${report.pagesChecked === 1 ? "" : "s"} checked: ${counts.fail} to fix, ${counts.warn} worth fixing, ${counts.info} good to know.`,
  ];
  for (const severity of ["fail", "warn", "info"] as const) {
    const group = report.findings.filter((f) => f.severity === severity);
    if (group.length === 0) continue;
    lines.push("", `${HEADINGS[severity]} (${group.length})`);
    const byMessage = new Map<string, Finding[]>();
    for (const f of group) {
      const key = `${f.check}\n${f.message}`;
      byMessage.set(key, [...(byMessage.get(key) ?? []), f]);
    }
    for (const same of byMessage.values()) {
      const where = same.length === 1 ? same[0].url : `${same[0].url} and ${same.length - 1} more`;
      lines.push(`- ${same[0].message}`, `  ${where}`);
    }
  }
  if (report.findings.length === 0) lines.push("", "No problems found.");
  return lines.join("\n");
}

export type FailOn = "never" | "warn" | "fail";

/** 1 when the report has findings at or above the --fail-on level. */
export function exitCodeFor(report: AuditReport, failOn: FailOn): 0 | 1 {
  if (failOn === "never") return 0;
  if (report.counts.fail > 0) return 1;
  return failOn === "warn" && report.counts.warn > 0 ? 1 : 0;
}
