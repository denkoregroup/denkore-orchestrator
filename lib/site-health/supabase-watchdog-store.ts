/**
 * DELIBERATE: the secret-key client (the service_role Postgres role), because the watchdog runs in
 * the signed tick, a machine caller. It reads projects and audit_reports, and inserts one kind of
 * events row (no run, free-text kind and actor, which events already allows). It cannot change or
 * delete anything: events is append-only and service_role has no update or delete grant.
 */
import "server-only";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/admin";
import { OVERDUE_EVENT_ACTOR, OVERDUE_EVENT_KIND, type WatchdogStore, type WatchedSite } from "./watchdog";

const UNIQUE_VIOLATION = "23505";

const projectRow = z.object({ id: z.uuid(), registry_id: z.string(), created_at: z.string() });
const reportRow = z.object({ started_at: z.string() });

function fail(what: string, error: { message: string }): never {
  throw new Error(`site watchdog store: ${what} failed: ${error.message}`);
}

export class SupabaseWatchdogStore implements WatchdogStore {
  async watchedSites(registryIds: string[]): Promise<WatchedSite[]> {
    const db = createServiceClient();
    const projects = await db.from("projects").select("id, registry_id, created_at").in("registry_id", registryIds);
    if (projects.error) fail("project lookup", projects.error);
    const rows = z.array(projectRow).parse(projects.data ?? []);

    // A handful of sites: one "newest report" query each.
    return Promise.all(
      rows.map(async (project) => {
        const newest = await db
          .from("audit_reports")
          .select("started_at")
          .eq("project_id", project.id)
          .order("started_at", { ascending: false })
          .limit(1);
        if (newest.error) fail(`newest report for ${project.registry_id}`, newest.error);
        const [latest] = z.array(reportRow).parse(newest.data ?? []);
        return { registryId: project.registry_id, registeredAt: project.created_at, lastReportAt: latest?.started_at ?? null };
      }),
    );
  }

  async escalate({ idempotencyKey, payload }: Parameters<WatchdogStore["escalate"]>[0]) {
    const inserted = await createServiceClient().from("events").insert({
      run_id: null,
      kind: OVERDUE_EVENT_KIND,
      payload,
      actor: OVERDUE_EVENT_ACTOR,
      idempotency_key: idempotencyKey,
    });
    if (inserted.error?.code === UNIQUE_VIOLATION) return "duplicate" as const;
    if (inserted.error) fail("escalation insert", inserted.error);
    return "recorded" as const;
  }
}
