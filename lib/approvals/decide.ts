import { z } from "zod";
import type { ApprovalMode } from "./types";

/** Stored as the approval note on PR-review approvals. */
export const PR_REVIEW_ATTESTATION = "I reviewed the pull request and ran the checks locally";

export const DECISION_MESSAGES = {
  stale: "This changed since you opened it. Refresh to see the latest.",
  alreadyDecided: "This was already decided.",
  notAllowed: "You can’t decide this one. Sign in as the owner and try again.",
  needsReview: "Tick the box to confirm you reviewed the pull request.",
  invalid: "That didn’t go through. Refresh and try again.",
  failed: "That didn’t save. Try again in a moment.",
} as const;

export const NOTE_MAX = 2000;

export const decisionFormSchema = z.object({
  gateId: z.uuid(),
  /** The SHA that was displayed on the card. Never re-read on the server. */
  commitSha: z.string().regex(/^[0-9a-f]{7,40}$/),
  decision: z.enum(["approve", "request_changes"]),
  note: z.string().trim().max(NOTE_MAX).optional(),
  reviewed: z.literal("on").optional(),
});

export type DecisionForm = z.infer<typeof decisionFormSchema>;

export interface DecisionState {
  status: "idle" | "success" | "error";
  /** The gate the message is about, so each card shows only its own error. */
  gateId: string | null;
  message: string;
}

export const INITIAL_DECISION_STATE: DecisionState = { status: "idle", gateId: null, message: "" };

export function readDecisionForm(formData: FormData) {
  const get = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" && value !== "" ? value : undefined;
  };
  return decisionFormSchema.safeParse({
    gateId: get("gateId"),
    commitSha: get("commitSha"),
    decision: get("decision"),
    note: get("note"),
    reviewed: get("reviewed"),
  });
}

/** The note to store, or an error if a PR-review approval was not confirmed. */
export function noteFor(form: DecisionForm, mode: ApprovalMode): { note: string | null } | { error: string } {
  const ownerNote = form.note ? form.note : null;
  if (form.decision === "request_changes") return { note: ownerNote };
  if (mode === "one_tap") return { note: ownerNote };
  if (form.reviewed !== "on") return { error: DECISION_MESSAGES.needsReview };
  return { note: ownerNote ? `${PR_REVIEW_ATTESTATION}\n\n${ownerNote}` : PR_REVIEW_ATTESTATION };
}

/**
 * Turns the approval triggers' errors (003_functions.sql) into words.
 *   approvals_before_insert: "approval is for X, but the gate now covers Y" -> stale
 *                            "gate is already approved|changes_requested"   -> already decided
 *                            "not the owner of this gate" / RLS / 42501     -> not allowed
 *   foreign key (23503): the gate is gone                                  -> stale
 */
export function friendlyApprovalError(error: { code?: string; message: string }): string {
  const message = error.message.toLowerCase();
  if (message.includes("but the gate now covers")) return DECISION_MESSAGES.stale;
  if (message.includes("gate is already")) return DECISION_MESSAGES.alreadyDecided;
  if (error.code === "23503") return DECISION_MESSAGES.stale;
  if (
    error.code === "42501" ||
    message.includes("not the owner") ||
    message.includes("row-level security") ||
    message.includes("permission denied") ||
    message.includes("signed-in owner")
  ) {
    return DECISION_MESSAGES.notAllowed;
  }
  return DECISION_MESSAGES.failed;
}
