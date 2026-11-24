import "server-only";
import { z } from "zod";
import { requireOwner } from "@/lib/auth";
import { RUN_ANSWERED_EVENT, answerPayloadSchema } from "@/lib/run-reports/answers";
import { runReportSchema, type RunReport } from "@/lib/run-reports/schema";
import { createClient } from "@/lib/supabase/server";
import { parseRows, queryError } from "./rows";

/** Reports older than this are left off the Waiting on you page. */
export const RUN_REPORT_WINDOW_DAYS = 7;
const MAX_ROWS = 100;

const runReportRow = z.object({
  id: z.uuid(),
  registry_id: z.string().min(1),
  received_at: z.string(),
  report: runReportSchema,
});

const answerRow = z.object({ payload: answerPayloadSchema, created_at: z.string() });

/** David's answer to one numbered decision, from the Waiting on you page. */
export interface DecisionAnswer {
  answer: string;
  answeredAt: string;
}

export interface LatestRunReport {
  /** The run_reports row, which an answer refers to. */
  id: string;
  report: RunReport;
  receivedAt: string;
  /** Keyed by decision number. */
  answers: Record<number, DecisionAnswer>;
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
    .select("id, registry_id, received_at, report")
    .gte("started_at", since)
    .order("started_at", { ascending: false })
    .limit(MAX_ROWS);
  if (error) throw queryError("getLatestRunReports", error);

  const latest = new Map<string, LatestRunReport>();
  for (const row of parseRows(runReportRow, data, "run_reports")) {
    if (!latest.has(row.registry_id)) latest.set(row.registry_id, { id: row.id, report: row.report, receivedAt: row.received_at, answers: {} });
  }

  const asked = [...latest.values()].filter((l) => l.report.decisions.length > 0);
  if (asked.length > 0) {
    const byId = new Map(asked.map((l) => [l.id, l]));
    const answered = await db
      .from("events")
      .select("payload, created_at")
      .eq("kind", RUN_ANSWERED_EVENT)
      .in("payload->>run_report_id", [...byId.keys()]);
    if (answered.error) throw queryError("getLatestRunReports (answers)", answered.error);
    for (const row of parseRows(answerRow, answered.data, "events")) {
      const target = byId.get(row.payload.run_report_id);
      if (target) target.answers[row.payload.decision_number] = { answer: row.payload.answer, answeredAt: row.created_at };
    }
  }

  return [...latest.values()].sort(
    (a, b) =>
      Number(b.report.decisions.length > 0) - Number(a.report.decisions.length > 0) ||
      Date.parse(b.report.startedAt) - Date.parse(a.report.startedAt),
  );
}

/** The newest report from one project's runs, whatever its age; null when there is none. */
export async function getNewestRunReport(registryId: string): Promise<{ id: string; report: RunReport } | null> {
  await requireOwner();
  const db = await createClient();
  const { data, error } = await db
    .from("run_reports")
    .select("id, registry_id, received_at, report")
    .eq("registry_id", registryId)
    .order("started_at", { ascending: false })
    .limit(1);
  if (error) throw queryError("getNewestRunReport", error);
  const [row] = parseRows(runReportRow, data, "run_reports");
  return row ? { id: row.id, report: row.report } : null;
}
