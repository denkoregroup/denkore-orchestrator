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
