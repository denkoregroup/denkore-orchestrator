"use client";

import { useState } from "react";
import { NOTE_MAX, PR_REVIEW_ATTESTATION } from "@/lib/approvals/decide";
import type { ApprovalMode } from "@/lib/approvals/types";
import { useDecision } from "./approvals-board";

export function DecisionForm({
  gateId,
  commitSha,
  mode,
}: {
  gateId: string;
  /** The SHA shown on the card. Sent back as-is so a moved gate is rejected. */
  commitSha: string;
  mode: ApprovalMode;
}) {
  const { formAction, state, pending } = useDecision();
  const [reviewed, setReviewed] = useState(false);
  const needsReview = mode === "pr_review";
  const error = state.status === "error" && state.gateId === gateId ? state.message : "";

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="gateId" value={gateId} />
      <input type="hidden" name="commitSha" value={commitSha} />

      {needsReview && (
        <label className="flex min-h-12 items-start gap-3 rounded-md border border-border p-3">
          <input
            type="checkbox"
            name="reviewed"
            checked={reviewed}
            onChange={(e) => setReviewed(e.target.checked)}
            className="mt-0.5 size-5 shrink-0"
          />
          <span>{PR_REVIEW_ATTESTATION}</span>
        </label>
      )}

      <div className="space-y-1">
        <label htmlFor={`${gateId}-note`} className="block text-sm font-medium">
          Note (optional)
        </label>
        <p id={`${gateId}-note-hint`} className="text-sm text-muted">
          Most useful when you ask for changes: say what should be different.
        </p>
        <textarea
          id={`${gateId}-note`}
          name="note"
          rows={3}
          maxLength={NOTE_MAX}
          aria-describedby={`${gateId}-note-hint`}
          className="w-full rounded-md border border-border bg-background p-3"
        />
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <button
          type="submit"
          name="decision"
          value="approve"
          disabled={pending || (needsReview && !reviewed)}
          className="min-h-12 flex-1 rounded-md bg-foreground font-medium text-background disabled:opacity-60"
        >
          Approve
        </button>
        <button
          type="submit"
          name="decision"
          value="request_changes"
          disabled={pending}
          className="min-h-12 flex-1 rounded-md border border-border font-medium disabled:opacity-60"
        >
          Request changes
        </button>
      </div>

      <p aria-live="polite" className="min-h-6 text-sm font-medium text-accent">
        {error}
      </p>
    </form>
  );
}
