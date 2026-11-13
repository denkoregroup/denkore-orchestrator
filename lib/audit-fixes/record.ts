/**
 * DELIBERATE: the secret-key client (the service_role Postgres role). The owner cannot write events, and
 * 002_rls.sql lets service_role insert them, so this is the one way a click leaves its record: which
 * findings the run was started for. It is only called from a server action that has called requireOwner().
 */
import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { FIX_REQUESTED_EVENT } from "./prompt";

export async function recordFixRequested(input: { runId: string; ownerId: string; reportId: string; severity: string; findingIds: string[] }): Promise<void> {
  const { error } = await createServiceClient()
    .from("events")
    .insert({
      run_id: input.runId,
      kind: FIX_REQUESTED_EVENT,
      payload: { report_id: input.reportId, severity: input.severity, finding_ids: input.findingIds },
      actor: `owner:${input.ownerId}`,
      idempotency_key: `${FIX_REQUESTED_EVENT}:${input.runId}`,
    });
  if (error) throw new Error(`recordFixRequested: ${error.message}`);
}
