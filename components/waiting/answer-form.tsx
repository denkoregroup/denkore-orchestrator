"use client";

import { useActionState, useState } from "react";
import { answerDecisionAction } from "@/app/(app)/waiting/actions";
import { INITIAL_ANSWER_STATE, MAX_ANSWER_LENGTH } from "@/lib/run-reports/answer-copy";

/** Answer one numbered decision: tap an option to fill the box, or type, then send. */
export function AnswerForm({
  registryId,
  runReportId,
  decisionNumber,
  options,
}: {
  registryId: string;
  runReportId: string;
  decisionNumber: number;
  options?: string[];
}) {
  const [state, action, pending] = useActionState(answerDecisionAction, INITIAL_ANSWER_STATE);
  const [answer, setAnswer] = useState("");
  const id = `answer-${registryId}-${decisionNumber}`;

  return (
    <form action={action} className="mt-2 space-y-2">
      <input type="hidden" name="registryId" value={registryId} />
      <input type="hidden" name="runReportId" value={runReportId} />
      <input type="hidden" name="decisionNumber" value={decisionNumber} />
      {options && options.length > 0 && (
        <ul className="flex flex-wrap gap-2 text-sm" aria-label={`Options for decision ${decisionNumber}`}>
          {options.map((o) => (
            <li key={o}>
              <button
                type="button"
                onClick={() => setAnswer(o)}
                aria-pressed={answer === o}
                className="min-h-12 rounded-full border border-border px-4 aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:font-semibold aria-pressed:text-signal"
              >
                {o}
              </button>
            </li>
          ))}
        </ul>
      )}
      <label htmlFor={id} className="block text-sm font-medium">
        Your answer to {decisionNumber}
      </label>
      <textarea
        id={id}
        name="answer"
        rows={2}
        maxLength={MAX_ANSWER_LENGTH}
        value={answer}
        onChange={(e) => setAnswer(e.target.value)}
        className="w-full rounded-md border border-border bg-background p-3"
      />
      <button
        type="submit"
        disabled={pending || answer.trim() === ""}
        className="min-h-12 rounded-md bg-foreground px-4 font-medium text-background disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send"}
      </button>
      <p aria-live="polite" className="min-h-5 text-sm text-muted">
        {state.message}
      </p>
    </form>
  );
}
