"use server";

import { revalidatePath } from "next/cache";
import { requireOwner } from "@/lib/auth";
import { getNewestRunReport } from "@/lib/data/run-reports";
import { ANSWER_MESSAGES, type AnswerState } from "@/lib/run-reports/answer-copy";
import { answerFormSchema } from "@/lib/run-reports/answers";
import { recordRunAnswer } from "@/lib/run-reports/record-answer";

/**
 * David's answer to one numbered decision from a run. Stored once per decision. Only the newest
 * report's decisions can be answered, because that is the report the next run fetches answers for.
 */
export async function answerDecisionAction(_previous: AnswerState, formData: FormData): Promise<AnswerState> {
  const owner = await requireOwner();

  const parsed = answerFormSchema.safeParse({
    registryId: formData.get("registryId"),
    runReportId: formData.get("runReportId"),
    decisionNumber: formData.get("decisionNumber"),
    answer: formData.get("answer") ?? "",
  });
  if (!parsed.success) return { status: "error", message: ANSWER_MESSAGES.invalid };
  const form = parsed.data;

  const newest = await getNewestRunReport(form.registryId);
  if (!newest || newest.id !== form.runReportId) return { status: "error", message: ANSWER_MESSAGES.stale };
  const decision = newest.report.decisions.find((d) => d.number === form.decisionNumber);
  if (!decision) return { status: "error", message: ANSWER_MESSAGES.stale };

  const { status } = await recordRunAnswer({
    ownerId: owner.id,
    payload: {
      run_report_id: newest.id,
      registry_id: form.registryId,
      decision_number: decision.number,
      question: decision.question,
      answer: form.answer,
    },
  });
  if (status === "duplicate") return { status: "error", message: ANSWER_MESSAGES.duplicate };

  revalidatePath("/waiting");
  revalidatePath("/activity");
  return { status: "success", message: ANSWER_MESSAGES.sent(form.registryId) };
}
