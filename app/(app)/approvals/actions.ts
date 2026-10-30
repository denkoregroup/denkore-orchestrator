"use server";

import { revalidatePath } from "next/cache";
import { getGateForDecision, insertApproval } from "@/lib/data/gates";
import {
  DECISION_MESSAGES,
  friendlyApprovalError,
  noteFor,
  readDecisionForm,
  type DecisionState,
} from "@/lib/approvals/decide";
import { approvalModeFor } from "@/lib/approvals/mode";
import { getRegistry } from "@/lib/registry/cached";

const GATE_NAMES = { spec: "plan", design: "design", release: "go-live" } as const;

export async function decideGateAction(_prev: DecisionState, formData: FormData): Promise<DecisionState> {
  const parsed = readDecisionForm(formData);
  if (!parsed.success) {
    const gateId = formData.get("gateId");
    return {
      status: "error",
      gateId: typeof gateId === "string" ? gateId : null,
      message: DECISION_MESSAGES.invalid,
    };
  }
  const form = parsed.data;
  const fail = (message: string): DecisionState => ({ status: "error", gateId: form.gateId, message });

  // Checks the owner first. Reads the gate's kind and project only, never its SHA.
  const gate = await getGateForDecision(form.gateId);
  if (!gate) return fail(DECISION_MESSAGES.stale);

  // Decide the mode on the server; the form's view of it is not trusted.
  const registry = await getRegistry();
  const mode = approvalModeFor(gate.registryId ? registry.get(gate.registryId) : undefined, gate.kind);
  const note = noteFor(form, mode);
  if ("error" in note) return fail(note.error);

  const { error } = await insertApproval({
    gateId: form.gateId,
    // The SHA that was on screen. If the gate moved, the database rejects it.
    commitSha: form.commitSha,
    decision: form.decision,
    note: note.note,
  });
  if (error) return fail(friendlyApprovalError(error));

  revalidatePath("/approvals");
  const project = gate.registryId ?? "this project";
  return {
    status: "success",
    gateId: form.gateId,
    message:
      form.decision === "approve"
        ? `Approved the ${GATE_NAMES[gate.kind]} for ${project}. Your decision is saved.`
        : `Asked for changes to the ${GATE_NAMES[gate.kind]} for ${project}. Your decision is saved.`,
  };
}
