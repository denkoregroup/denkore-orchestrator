import { checkInfo } from "@/lib/audits/checks/catalog";
import type { AuditReport, Finding, Severity } from "@/lib/audits/types";
import { FIX, shortRunId } from "./copy";

/** What the page knows about the site, beyond the report, to decide what can be handed to the Conductor. */
export interface FixContext {
  /** The project the report is linked to; null for a prospect or a site that is not registered. */
  projectId: string | null;
  /** The site's repository, from the project registry; null when it has none. */
  repo: string | null;
  /** True when this is the newest report for the site. Findings of an older report may be fixed already. */
  isLatest: boolean;
  /** The site's open fix run, if any, and the findings it was started for. */
  openRun: { id: string; findingIds: string[] } | null;
}

export type FindingMark =
  | { kind: "fixable" }
  | { kind: "needs_you"; instruction: string }
  | { kind: "in_progress"; runId: string };

/** No button, a button, or a button that is off and says why. */
export type GroupButton = null | { enabled: true } | { enabled: false; reason: string };

export interface FixPlan {
  marks: Map<string, FindingMark>;
  groups: Record<Severity, GroupButton>;
}

const SEVERITIES: readonly Severity[] = ["fail", "warn", "info"];

function markOf(finding: Finding, ctx: FixContext): FindingMark {
  if (ctx.openRun?.findingIds.includes(finding.id)) return { kind: "in_progress", runId: ctx.openRun.id };
  const info = checkInfo(finding.check);
  return info.fixableInCode ? { kind: "fixable" } : { kind: "needs_you", instruction: info.needsYou };
}

/** The findings of one severity group that a new run would contain: fixable, and not already in a run. */
export function findingsForRun(report: AuditReport, ctx: FixContext, severity: Severity): Finding[] {
  return report.findings.filter((f) => f.severity === severity && markOf(f, ctx).kind === "fixable");
}

/**
 * What each finding shows ("Needs you", "In progress", or nothing) and what each severity group's button
 * does. A group with nothing the Conductor can fix has no button; otherwise the button is off, with the
 * reason, when the site has no repository, the report is not the newest, or a run is already open.
 */
export function planFixes(report: AuditReport, ctx: FixContext): FixPlan {
  const marks = new Map(report.findings.map((f) => [f.id, markOf(f, ctx)] as const));
  const groups = {} as Record<Severity, GroupButton>;
  for (const severity of SEVERITIES) {
    const inGroup = report.findings.filter((f) => f.severity === severity);
    if (!inGroup.some((f) => checkInfo(f.check).fixableInCode)) {
      groups[severity] = null;
    } else if (ctx.repo === null) {
      groups[severity] = { enabled: false, reason: FIX.noRepo };
    } else if (!ctx.isLatest) {
      groups[severity] = { enabled: false, reason: FIX.notLatest };
    } else if (ctx.openRun) {
      groups[severity] = { enabled: false, reason: FIX.runOpen(shortRunId(ctx.openRun.id)) };
    } else {
      groups[severity] = { enabled: true };
    }
  }
  return { marks, groups };
}
