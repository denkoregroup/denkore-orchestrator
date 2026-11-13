import "server-only";
import { z } from "zod";
import { auditReportSchema, compareStrings, type AuditReport } from "@/lib/audits/types";
import { requireOwner } from "@/lib/auth";
import { parseRow, parseRows, queryError } from "@/lib/data/rows";
import { getRegistry } from "@/lib/registry/cached";
import { createClient } from "@/lib/supabase/server";
import { isOverdue } from "./overdue";

/** How many of the newest reports /sites reads to find each site's latest. */
export const SITES_SCAN_LIMIT = 1000;

const summaryRow = z.object({
  id: z.uuid(),
  project_id: z.uuid().nullable(),
  target: z.string().min(1),
  started_at: z.string(),
  finished_at: z.string(),
  pages_checked: z.number().int(),
  info_count: z.number().int(),
  warn_count: z.number().int(),
  fail_count: z.number().int(),
});
const SUMMARY_COLUMNS = "id, project_id, target, started_at, finished_at, pages_checked, info_count, warn_count, fail_count";

// The report column is parsed with the same schema the ingest route used, so a
// row that no longer fits fails loudly instead of rendering wrong data.
const reportRow = summaryRow.extend({ report: auditReportSchema });
const REPORT_COLUMNS = `${SUMMARY_COLUMNS}, report`;

export interface SiteSummary {
  /** The id of the site's latest report. */
  id: string;
  target: string;
  startedAt: string;
  pagesChecked: number;
  counts: { fail: number; warn: number; info: number };
  /** A registered site whose newest report is more than two days old (a scheduled run was missed). */
  overdue: boolean;
}

/** A registered site with no report at all, so it would otherwise not be listed. */
export interface UnreportedSite {
  registryId: string;
  overdue: boolean;
}

export interface StoredReport {
  id: string;
  target: string;
  startedAt: string;
  pagesChecked: number;
  report: AuditReport;
}

function summarize(row: z.infer<typeof summaryRow>, overdue: boolean): SiteSummary {
  return {
    id: row.id,
    target: row.target,
    startedAt: row.started_at,
    pagesChecked: row.pages_checked,
    counts: { fail: row.fail_count, warn: row.warn_count, info: row.info_count },
    overdue,
  };
}

const projectRow = z.object({ id: z.uuid(), registry_id: z.string(), created_at: z.string() });

/**
 * Every audited site with its latest report, by address. PostgREST cannot pick the newest row per
 * group, so this reads the newest SITES_SCAN_LIMIT report summaries (no findings) and keeps the first
 * per target. `truncated` says the read hit that limit, so a site with no recent report may be missing.
 *
 * A registered site (a registry entry with an audits block) is marked overdue when its newest report
 * is more than two days old, and listed under `unreported` if it has none at all.
 */
export async function listSites(now = new Date()): Promise<{ sites: SiteSummary[]; unreported: UnreportedSite[]; truncated: boolean }> {
  await requireOwner();
  const db = await createClient();
  const { data, error } = await db
    .from("audit_reports")
    .select(SUMMARY_COLUMNS)
    .order("started_at", { ascending: false })
    .limit(SITES_SCAN_LIMIT);
  if (error) throw queryError("listSites", error);
  const rows = parseRows(summaryRow, data, "audit_reports");

  const registryIds = [...(await getRegistry()).values()].filter((e) => e.audits).map((e) => e.id);
  const projectsRes = registryIds.length === 0 ? { data: [], error: null } : await db.from("projects").select("id, registry_id, created_at").in("registry_id", registryIds);
  if (projectsRes.error) throw queryError("listSites (registered sites)", projectsRes.error);
  const projects = parseRows(projectRow, projectsRes.data, "projects");

  // Rows are newest first, so the first one seen for a project is its newest report.
  const newestByProject = new Map<string, string>();
  for (const row of rows) if (row.project_id && !newestByProject.has(row.project_id)) newestByProject.set(row.project_id, row.started_at);
  const registeredAt = new Map(projects.map((p) => [p.id, p.created_at]));

  const latest = new Map<string, SiteSummary>();
  for (const row of rows) {
    if (latest.has(row.target)) continue;
    const created = row.project_id ? registeredAt.get(row.project_id) : undefined;
    const overdue = created !== undefined && isOverdue({ lastReportAt: newestByProject.get(row.project_id!) ?? null, registeredAt: created }, now);
    latest.set(row.target, summarize(row, overdue));
  }

  const unreported = projects
    .filter((p) => !newestByProject.has(p.id))
    .map((p) => ({ registryId: p.registry_id, overdue: isOverdue({ lastReportAt: null, registeredAt: p.created_at }, now) }))
    .sort((a, b) => compareStrings(a.registryId, b.registryId));

  return {
    sites: [...latest.values()].sort((a, b) => compareStrings(a.target, b.target)),
    unreported,
    truncated: rows.length === SITES_SCAN_LIMIT,
  };
}

function stored(row: z.infer<typeof reportRow>): StoredReport {
  return { id: row.id, target: row.target, startedAt: row.started_at, pagesChecked: row.pages_checked, report: row.report };
}

/** One stored report, and the report for the same site just before it (null for the first). Null if there is no such report. */
export async function getSiteReport(id: string): Promise<{ current: StoredReport; previous: StoredReport | null } | null> {
  await requireOwner();
  if (!z.uuid().safeParse(id).success) return null;
  const db = await createClient();

  const found = await db.from("audit_reports").select(REPORT_COLUMNS).eq("id", id).maybeSingle();
  if (found.error) throw queryError("getSiteReport", found.error);
  if (!found.data) return null;
  const current = stored(parseRow(reportRow, found.data, "audit_reports"));

  const before = await db
    .from("audit_reports")
    .select(REPORT_COLUMNS)
    .eq("target", current.target)
    .lt("started_at", current.startedAt)
    .order("started_at", { ascending: false })
    .limit(1);
  if (before.error) throw queryError("getSiteReport (previous report)", before.error);
  const [previous] = parseRows(reportRow, before.data, "audit_reports");
  return { current, previous: previous ? stored(previous) : null };
}
