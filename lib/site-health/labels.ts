import type { Severity } from "@/lib/audits/types";

/** The three groups an owner sees, worst first. Plain words for the auditor's fail, warn and info. */
export const SEVERITY_GROUPS: ReadonlyArray<{ severity: Severity; label: string }> = [
  { severity: "fail", label: "Needs fixing" },
  { severity: "warn", label: "Worth fixing" },
  { severity: "info", label: "Good to know" },
];

/** "https://www.example.com/" -> "www.example.com". The address a report names, without the scheme and trailing slash. */
export function siteName(target: string): string {
  const url = new URL(target);
  const path = url.pathname === "/" ? "" : url.pathname;
  return `${url.host}${path}`;
}

export function pagesLabel(count: number): string {
  return count === 1 ? "1 page" : `${count} pages`;
}

/** "2 worth fixing · 9 good to know": the non-empty groups of a report, worst first. */
export function summaryLine(counts: { fail: number; warn: number; info: number }): string {
  const parts = [
    counts.fail > 0 ? (counts.fail === 1 ? "1 needs fixing" : `${counts.fail} need fixing`) : null,
    counts.warn > 0 ? `${counts.warn} worth fixing` : null,
    counts.info > 0 ? `${counts.info} good to know` : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(" · ") : "No problems found";
}
