import { isAuditFixPrompt } from "@/lib/audit-fixes/prompt";
import type { RegistryEntry } from "@/lib/registry/schema";
import type { StepInput, StepName } from "@/lib/step-runner/types";
import { modelFor } from "./defaults";
import { LIMITS } from "./limits";

/**
 * The shared agent contract: one config for every step, not per-agent tuning.
 */

/**
 * PLACEHOLDERS. Review these allowlists before any real runner is connected:
 * they decide what an agent may run on a real repository.
 */
const READ_WRITE = ["Read", "Grep", "Glob", "Write", "Edit"];
export const TOOL_ALLOWLISTS: Readonly<Record<StepName, readonly string[]>> = {
  spec: READ_WRITE,
  design: READ_WRITE,
  build_test: [...READ_WRITE, "Bash(pnpm *)", "Bash(git *)"],
  verify: ["Read", "Grep", "Glob", "Bash(pnpm *)"],
  deploy: ["Read", "Bash(gh pr view *)"],
  post_deploy_check: ["Read", "Bash(gh pr view *)"],
};

/** Included verbatim in every task. */
export const SHIP_AND_LOG_RULE =
  "Blockers (security, production deploys, infrastructure, SQL or data changes, claims in client content, anything involving AB, Shepp or other outside parties) must stop and escalate. Everything else: take a sensible default, log the open question as a backlog improvement, and keep going. Do not perfect; ship and log.";

/** Extra instructions, in fixed words, for the steps of a run made from an audit report. */
export const AUDIT_FIX_STEP_NOTES: Partial<Record<StepName, string>> = {
  build_test: "This is a fix for audit findings. Fix only the findings listed above. The acceptance criterion is that the next audit report shows every one of them fixed.",
  verify: "Scope check: the findings listed above are the ticket. Every change in this commit must map to one of them. List any change that does not, and do not approve it.",
};

export function branchFor(runId: string): string {
  return `cast/${runId.slice(0, 8)}`;
}

export function buildTask(input: {
  step: StepName;
  prompt: string;
  constraints: readonly string[];
  ownerNote: string | null;
}): string {
  const sections = [`Step: ${input.step}`, `What the owner asked for:\n${input.prompt}`];
  if (input.constraints.length > 0) {
    sections.push(`Project constraints:\n${input.constraints.map((c) => `- ${c}`).join("\n")}`);
  }
  const fixNote = isAuditFixPrompt(input.prompt) ? AUDIT_FIX_STEP_NOTES[input.step] : undefined;
  if (fixNote) sections.push(fixNote);
  if (input.ownerNote) {
    sections.push(`The owner asked for changes:\n${input.ownerNote}`);
  }
  sections.push(SHIP_AND_LOG_RULE);
  return sections.join("\n\n");
}

export function buildStepInput(input: {
  runId: string;
  step: StepName;
  prompt: string;
  entry: RegistryEntry;
  ownerNote: string | null;
}): StepInput {
  return {
    runId: input.runId,
    step: input.step,
    registryEntry: input.entry,
    task: buildTask({
      step: input.step,
      prompt: input.prompt,
      constraints: input.entry.constraints,
      ownerNote: input.ownerNote,
    }),
    toolAllowlist: [...TOOL_ALLOWLISTS[input.step]],
    model: modelFor(input.step),
    maxTurns: LIMITS.maxTurns,
    timeoutSeconds: LIMITS.stepTimeoutSeconds,
    branch: branchFor(input.runId),
  };
}
