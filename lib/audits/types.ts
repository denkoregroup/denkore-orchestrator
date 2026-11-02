/**
 * The audit findings format. Later slices store, diff and triage this output,
 * so treat it as a public contract: add fields, never repurpose them, and bump
 * schemaVersion for anything incompatible.
 *
 * Imports are relative (no @/ alias) so the CLI can load this under ts-node.
 */
import { createHash } from "node:crypto";
import { z } from "zod";

export const SEVERITIES = ["info", "warn", "fail"] as const;
export const severitySchema = z.enum(SEVERITIES);
export type Severity = z.infer<typeof severitySchema>;

export const findingSchema = z.strictObject({
  /** Stable fingerprint: the same problem gets the same id on every run. */
  id: z.string().regex(/^[0-9a-f]{16}$/),
  /** Which check produced it, e.g. "page.title". */
  check: z.string().min(1),
  severity: severitySchema,
  /** The page or resource the finding is about. */
  url: z.string().min(1),
  /** Plain language an owner can act on. No jargon. */
  message: z.string().min(1),
  /** Raw detail for whoever fixes it (a header value, the linking pages...). */
  evidence: z.string().optional(),
});
export type Finding = z.infer<typeof findingSchema>;

export const auditReportSchema = z.strictObject({
  schemaVersion: z.literal(1),
  target: z.string().min(1),
  startedAt: z.iso.datetime(),
  finishedAt: z.iso.datetime(),
  pagesChecked: z.number().int().nonnegative(),
  findings: z.array(findingSchema),
  counts: z.strictObject({
    info: z.number().int().nonnegative(),
    warn: z.number().int().nonnegative(),
    fail: z.number().int().nonnegative(),
  }),
});
export type AuditReport = z.infer<typeof auditReportSchema>;

/** Plain code-unit order: unlike localeCompare, identical on every machine and locale. */
export function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Normalizes a URL for fingerprints: lowercase scheme and host, no default
 * port, no fragment, no trailing slash (except the root), sorted query.
 */
export function normalizeUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return raw.trim();
  }
  url.hash = "";
  const params = [...url.searchParams.entries()].sort(([a, av], [b, bv]) => (a === b ? compareStrings(av, bv) : compareStrings(a, b)));
  url.search = params.length ? `?${new URLSearchParams(params).toString()}` : "";
  if (url.pathname.length > 1 && url.pathname.endsWith("/")) url.pathname = url.pathname.replace(/\/+$/, "") || "/";
  // URL already lowercases scheme and host and drops default ports.
  return url.toString();
}

export function fingerprint(check: string, url: string, key = ""): string {
  return createHash("sha256").update(`${check}\n${normalizeUrl(url)}\n${key}`).digest("hex").slice(0, 16);
}

/** Builds a Finding with its id. `key` separates several findings of one check on one URL. */
export function finding(input: {
  check: string;
  severity: Severity;
  url: string;
  message: string;
  key?: string;
  evidence?: string;
}): Finding {
  const result: Finding = {
    id: fingerprint(input.check, input.url, input.key ?? ""),
    check: input.check,
    severity: input.severity,
    url: input.url,
    message: input.message,
  };
  if (input.evidence !== undefined) result.evidence = input.evidence;
  return result;
}

const SEVERITY_RANK: Record<Severity, number> = { fail: 0, warn: 1, info: 2 };

/** Deterministic order: severity (fail first), then check, then URL, then id. Duplicates by id are dropped. */
export function sortFindings(findings: Finding[]): Finding[] {
  const byId = new Map<string, Finding>();
  for (const f of findings) if (!byId.has(f.id)) byId.set(f.id, f);
  return [...byId.values()].sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
      compareStrings(a.check, b.check) ||
      compareStrings(a.url, b.url) ||
      compareStrings(a.id, b.id),
  );
}

export function countBySeverity(findings: Finding[]): AuditReport["counts"] {
  const counts = { info: 0, warn: 0, fail: 0 };
  for (const f of findings) counts[f.severity]++;
  return counts;
}
