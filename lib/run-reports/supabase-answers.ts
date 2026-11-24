/**
 * DELIBERATE: the secret-key client (the service_role Postgres role), because the run-answers route
 * is a machine caller authenticated by HMAC, not by a user session. It only reads: service_role may
 * select run_reports and events, and this file does nothing else.
 */
import "server-only";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/admin";
import { RUN_ANSWERED_EVENT, answerPayloadSchema, type AnswersForProject, type RunAnswerStore } from "./answers";
import { runReportSchema } from "./schema";

const newestRow = z.object({ id: z.uuid(), started_at: z.string(), report: runReportSchema });
const answerRow = z.object({ payload: answerPayloadSchema, created_at: z.string() });

export class SupabaseRunAnswerStore implements RunAnswerStore {
  async answersFor(registryId: string): Promise<AnswersForProject> {
    const db = createServiceClient();
    const newest = await db
      .from("run_reports")
      .select("id, started_at, report")
      .eq("registry_id", registryId)
      // The Conductor review's reports ask nothing, so answers belong to the repo runs' reports.
      .neq("mode", "review")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (newest.error) throw new Error(`run answers: reading run_reports failed: ${newest.error.message}`);
    if (!newest.data) return { runStartedAt: null, answers: [] };
    const report = newestRow.parse(newest.data);

    const answered = await db
      .from("events")
      .select("payload, created_at")
      .eq("kind", RUN_ANSWERED_EVENT)
      .eq("payload->>run_report_id", report.id)
      .order("id", { ascending: true });
    if (answered.error) throw new Error(`run answers: reading events failed: ${answered.error.message}`);

    // The question is read from the report itself, so it is the one the run asked.
    const questions = new Map(report.report.decisions.map((d) => [d.number, d.question]));
    const answers = z
      .array(answerRow)
      .parse(answered.data ?? [])
      .filter((row) => questions.has(row.payload.decision_number))
      .map((row) => ({
        number: row.payload.decision_number,
        question: questions.get(row.payload.decision_number)!,
        answer: row.payload.answer,
        answeredAt: row.created_at,
      }))
      .sort((a, b) => a.number - b.number);
    return { runStartedAt: report.report.startedAt, answers };
  }
}
