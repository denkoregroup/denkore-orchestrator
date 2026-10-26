import type { GateState } from "./states";

export type GateKind = "spec" | "design" | "release";

export const GATE_KIND_BY_STATE: Readonly<Record<GateState, GateKind>> = {
  spec_gate: "spec",
  design_gate: "design",
  release_gate: "release",
};

export interface Approval {
  approvedBy: string;
  /** The SHA the approver actually reviewed. */
  commitSha: string;
  approvedAt: string;
}

export interface Gate {
  kind: GateKind;
  /** The commit SHA this gate covers. */
  commitSha: string;
  approval: Approval | null;
}

const SHA_PATTERN = /^[0-9a-f]{7,40}$/;

export function isValidSha(sha: string): boolean {
  return SHA_PATTERN.test(sha);
}

export function openGate(kind: GateKind, commitSha: string): Gate {
  if (!isValidSha(commitSha)) throw new Error(`Invalid commit SHA: ${commitSha}`);
  return { kind, commitSha, approval: null };
}

/** An approval only counts if it was given for the SHA the gate currently covers. */
export function isGateApproved(gate: Gate): boolean {
  return gate.approval !== null && gate.approval.commitSha === gate.commitSha;
}

export function approveGate(
  gate: Gate,
  approval: { approvedBy: string; commitSha: string; approvedAt?: string },
): Gate {
  if (approval.commitSha !== gate.commitSha) {
    throw new Error(
      `Approval is for ${approval.commitSha} but gate covers ${gate.commitSha}`,
    );
  }
  return {
    ...gate,
    approval: {
      approvedBy: approval.approvedBy,
      commitSha: approval.commitSha,
      approvedAt: approval.approvedAt ?? new Date().toISOString(),
    },
  };
}

/** Moving the gate to a new SHA voids any existing approval. */
export function updateGateSha(gate: Gate, commitSha: string): Gate {
  if (!isValidSha(commitSha)) throw new Error(`Invalid commit SHA: ${commitSha}`);
  if (commitSha === gate.commitSha) return gate;
  return { ...gate, commitSha, approval: null };
}
