import type { RegistryEntry } from "@/lib/registry/schema";
import type { GateKind } from "@/lib/state-machine";
import type { ApprovalMode } from "./types";

/**
 * One-tap only when the project's registry entry lists the gate under
 * gates.oneTap. Everything else, including a project missing from the
 * registry, needs PR review.
 */
export function approvalModeFor(entry: RegistryEntry | undefined, kind: GateKind): ApprovalMode {
  if (entry?.gates.oneTap.includes(kind)) return "one_tap";
  return "pr_review";
}
