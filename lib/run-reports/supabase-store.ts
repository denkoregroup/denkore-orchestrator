/**
 * DELIBERATE: the secret-key client (the service_role Postgres role), because
 * the run-report route is a machine caller authenticated by HMAC, not by a user
 * session. The run_reports migration grants that role select and insert on
 * run_reports and nothing more: it cannot change or remove a stored report.
 */
import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import type { RunReportStore } from "./ingest";
import type { RunReport } from "./schema";

const UNIQUE_VIOLATION = "23505";

export class SupabaseRunReportStore implements RunReportStore {
  async record(report: RunReport) {
    const inserted = await createServiceClient()
      .from("run_reports")
      .insert({
        registry_id: report.registryId,
        repo: report.repo.toLowerCase(),
        mode: report.mode,
        started_at: report.startedAt,
        finished_at: report.finishedAt,
        decision_count: report.decisions.length,
        report,
      });
    if (inserted.error?.code === UNIQUE_VIOLATION) return { status: "duplicate" as const };
    if (inserted.error) throw new Error(`run report store: insert failed: ${inserted.error.message}`);
    return { status: "recorded" as const };
  }
}
