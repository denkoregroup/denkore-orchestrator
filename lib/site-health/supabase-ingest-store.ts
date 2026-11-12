/**
 * DELIBERATE: the secret-key client (the service_role Postgres role), because
 * the ingest route is a machine caller authenticated by HMAC, not by a user
 * session. 005_audit_reports.sql grants that role select and insert on
 * audit_reports and nothing more: it cannot update or delete a stored report.
 */
import "server-only";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/admin";
import type { ReportPayload, ReportStore } from "./ingest";

const UNIQUE_VIOLATION = "23505";

export class SupabaseReportStore implements ReportStore {
  async record({ registryId, report }: ReportPayload) {
    const db = createServiceClient();

    let projectId: string | null = null;
    if (registryId) {
      const found = await db.from("projects").select("id").eq("registry_id", registryId).maybeSingle();
      if (found.error) throw new Error(`audit report store: project lookup failed: ${found.error.message}`);
      projectId = found.data ? z.object({ id: z.uuid() }).parse(found.data).id : null;
    }

    const inserted = await db.from("audit_reports").insert({
      project_id: projectId,
      target: report.target,
      started_at: report.startedAt,
      finished_at: report.finishedAt,
      pages_checked: report.pagesChecked,
      info_count: report.counts.info,
      warn_count: report.counts.warn,
      fail_count: report.counts.fail,
      report,
    });
    if (inserted.error?.code === UNIQUE_VIOLATION) return { status: "duplicate" as const, projectLinked: projectId !== null };
    if (inserted.error) throw new Error(`audit report store: insert failed: ${inserted.error.message}`);
    return { status: "recorded" as const, projectLinked: projectId !== null };
  }
}
