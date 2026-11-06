import type { GateState } from "./states";

export type GateKind = "spec" | "design" | "release";

export const GATE_KIND_BY_STATE: Readonly<Record<GateState, GateKind>> = {
  spec_gate: "spec",
  design_gate: "design",
  release_gate: "release",
};

/** An approval as the reducer records it, for the gate kind it passed. */
export interface Approval {
  kind: GateKind;
  approvedBy: string;
  /** The SHA the approver actually reviewed; always the gate's SHA at that moment. */
  commitSha: string;
}

export interface Gate {
  kind: GateKind;
  /** The commit SHA this gate covers. An approval for any other SHA is rejected. */
  commitSha: string;
}

const SHA_PATTERN = /^[0-9a-f]{7,40}$/;

export function isValidSha(sha: string): boolean {
  return SHA_PATTERN.test(sha);
}

export function openGate(kind: GateKind, commitSha: string): Gate {
  if (!isValidSha(commitSha)) throw new Error(`Invalid commit SHA: ${commitSha}`);
  return { kind, commitSha };
}

/** Moving the gate to a new SHA means only an approval for the new SHA can pass it. */
export function updateGateSha(gate: Gate, commitSha: string): Gate {
  if (!isValidSha(commitSha)) throw new Error(`Invalid commit SHA: ${commitSha}`);
  if (commitSha === gate.commitSha) return gate;
  return { ...gate, commitSha };
}
