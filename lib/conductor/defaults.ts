import "server-only";
import { getRegistry } from "@/lib/registry/cached";
import { GitHubActionsRunner } from "@/lib/step-runner/github-actions";
import type { StepName } from "@/lib/step-runner/types";
import type { ConductorDeps } from "./advance";
import { SupabaseConductorStore } from "./supabase-store";

/**
 * The model every step uses. This file is the one place it is set: the task
 * contract (buildStepInput) and so every dispatch read it through modelFor().
 */
export const DEFAULT_MODEL = "claude-sonnet-5-5";

/**
 * Per-step exceptions, empty on purpose. To move one step to Opus, add one
 * line, e.g. `verify: "claude-opus-5-5",`.
 */
export const MODEL_OVERRIDES: Partial<Record<StepName, string>> = {};

export function modelFor(step: StepName, overrides: Partial<Record<StepName, string>> = MODEL_OVERRIDES): string {
  return overrides[step] ?? DEFAULT_MODEL;
}

/** PLACEHOLDER: the agent workflow the stub runner would dispatch in each project's repo. */
export const RUNNER_WORKFLOW = "denkore-step.yml";

/** Production wiring: Supabase store, the stub GitHub Actions runner (no network), the registry on disk. */
export function defaultConductorDeps(): ConductorDeps {
  return {
    store: new SupabaseConductorStore(),
    runnerFor: ({ attempt, entry }) => new GitHubActionsRunner({ repo: entry.repo, workflow: RUNNER_WORKFLOW, attempt }),
    registryEntry: async (registryId) => (await getRegistry()).get(registryId),
    now: () => new Date().toISOString(),
  };
}
