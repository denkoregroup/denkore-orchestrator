/**
 * DELIBERATE: the secret-key client (the service_role Postgres role). The owner cannot write events,
 * and 002_rls.sql lets service_role insert them, so this is how an answer is stored. It is only
 * called from the answer action, after requireOwner() and after the decision was checked against
 * the newest report.
 */
import "server-only";
import { createServiceClient } from "@/lib/supabase/admin";
import { RUN_ANSWERED_EVENT, answerKey, type AnswerPayload } from "./answers";

const UNIQUE_VIOLATION = "23505";

export async function recordRunAnswer(input: { ownerId: string; payload: AnswerPayload }): Promise<{ status: "recorded" | "duplicate" }> {
  const { error } = await createServiceClient()
    .from("events")
    .insert({
      run_id: null,
      kind: RUN_ANSWERED_EVENT,
      payload: input.payload,
      actor: `owner:${input.ownerId}`,
      idempotency_key: answerKey(input.payload.run_report_id, input.payload.decision_number),
    });
  if (error?.code === UNIQUE_VIOLATION) return { status: "duplicate" };
  if (error) throw new Error(`recordRunAnswer: ${error.message}`);
  return { status: "recorded" };
}
