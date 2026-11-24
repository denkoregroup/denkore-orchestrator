import "server-only";
import { z } from "zod";
import { requireOwner } from "@/lib/auth";
import { runReportSchema, type RunReport } from "@/lib/run-reports/schema";
import { createClient } from "@/lib/supabase/server";
import { parseRows, queryError } from "./rows";

/** Reports older than this are left off the Waiting on you page. */
export const RUN_REPORT_WINDOW_DAYS = 7;
const MAX_ROWS = 100;

const runReportRow = z.object({
  registry_id: z.string().min(1),
  received_at: z.string(),
  report: runReportSchema,
});

export interface LatestRunReport {
  report: RunReport;
  receivedAt: string;
}

/**
 * The newest report from each project's runs in the last week, newest first.
 * A project whose newest run raised decisions comes before one whose didn't.
 */
export async function getLatestRunReports(now: Date = new Date()): Promise<LatestRunReport[]> {
  await requireOwner();
  const since = new Date(now.getTime() - RUN_REPORT_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const db = await createClient();
  const { data, error } = await db
    .from("run_reports")
    .select("registry_id, received_at, report")
    .gte("started_at", since)
    .order("started_at", { ascending: false })
    .limit(MAX_ROWS);
  if (error) throw queryError("getLatestRunReports", error);

  const latest = new Map<string, LatestRunReport>();
  for (const row of parseRows(runReportRow, data, "run_reports")) {
    if (!latest.has(row.registry_id)) latest.set(row.registry_id, { report: row.report, receivedAt: row.received_at });
  }
  return [...latest.values()].sort(
    (a, b) =>
      Number(b.report.decisions.length > 0) - Number(a.report.decisions.length > 0) ||
      Date.parse(b.report.startedAt) - Date.parse(a.report.startedAt),
  );
}
