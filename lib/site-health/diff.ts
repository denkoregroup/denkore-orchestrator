import type { AuditReport, Finding } from "@/lib/audits/types";

export interface ReportDiff {
  /** In the current report only. */
  newFindings: Finding[];
  /** In both reports. Shown as in the current report, so a changed severity is the current one. */
  stillOpen: Finding[];
  /** In the previous report only: no longer found. */
  fixed: Finding[];
}

/**
 * Compares two reports by finding id. A finding's id is the same on every run
 * for the same problem (see lib/audits/types.ts), so set operations on ids say
 * what is new, what is still there and what is gone. Each list keeps the order
 * of the report it came from, which is already deterministic.
 */
export function diffReports(previous: AuditReport, current: AuditReport): ReportDiff {
  const previousIds = new Set(previous.findings.map((f) => f.id));
  const currentIds = new Set(current.findings.map((f) => f.id));
  return {
    newFindings: current.findings.filter((f) => !previousIds.has(f.id)),
    stillOpen: current.findings.filter((f) => previousIds.has(f.id)),
    fixed: previous.findings.filter((f) => !currentIds.has(f.id)),
  };
}
