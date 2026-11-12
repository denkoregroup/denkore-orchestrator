/**
 * The daily audit job: audit every registered site and post each report, one site after another.
 * One site failing never stops the others; the caller exits non-zero if any site failed.
 */
import type { PostResult } from "./post";
import type { AuditReport } from "./types";

export interface ScheduledSite {
  registryId: string;
  url: string;
  maxPages?: number;
  ignorePaths?: string[];
}

export type SiteOutcome =
  /** Audited and stored. */
  | { registryId: string; status: "ok"; findings: number; post: PostResult }
  /** The site never answered. Its single "Site unreachable" report is stored, and the job still fails. */
  | { registryId: string; status: "unreachable"; post: PostResult }
  /** The audit itself crashed, or the report could not be stored. */
  | { registryId: string; status: "failed"; step: "audit" | "post"; error: string };

export interface ScheduleDeps {
  audit(site: ScheduledSite): Promise<AuditReport>;
  post(site: ScheduledSite, report: AuditReport): Promise<PostResult>;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function runScheduledAudits(
  sites: ScheduledSite[],
  deps: ScheduleDeps,
): Promise<{ outcomes: SiteOutcome[]; failed: number }> {
  const outcomes: SiteOutcome[] = [];
  for (const site of sites) {
    let report: AuditReport;
    try {
      report = await deps.audit(site);
    } catch (e) {
      outcomes.push({ registryId: site.registryId, status: "failed", step: "audit", error: message(e) });
      continue;
    }
    let post: PostResult;
    try {
      post = await deps.post(site, report);
    } catch (e) {
      outcomes.push({ registryId: site.registryId, status: "failed", step: "post", error: message(e) });
      continue;
    }
    const unreachable = report.findings.some((f) => f.check === "site.unreachable");
    outcomes.push(
      unreachable
        ? { registryId: site.registryId, status: "unreachable", post }
        : { registryId: site.registryId, status: "ok", findings: report.findings.length, post },
    );
  }
  return { outcomes, failed: outcomes.filter((o) => o.status !== "ok").length };
}

/** One line per site for the job log. */
export function describeOutcome(outcome: SiteOutcome): string {
  const id = outcome.registryId;
  switch (outcome.status) {
    case "ok":
      return `ok         ${id}: ${outcome.post.status === "duplicate" ? "already stored" : "stored"}, ${outcome.findings} findings`;
    case "unreachable":
      return `UNREACHABLE ${id}: the site did not answer; its "Site unreachable" report was stored`;
    case "failed":
      return `FAILED     ${id}: ${outcome.step === "audit" ? "the audit crashed" : "the report was not stored"}: ${outcome.error}`;
  }
}
