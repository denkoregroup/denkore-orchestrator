import "server-only";
import { getRegistry } from "@/lib/registry/cached";
import { GitHubActionsRunner } from "@/lib/step-runner/github-actions";
import type { ConductorDeps } from "./advance";
import { RUNNER_WORKFLOW } from "./contract";
import { SupabaseConductorStore } from "./supabase-store";

/** Production wiring: Supabase store, the stub GitHub Actions runner (no network), the registry on disk. */
export function defaultConductorDeps(): ConductorDeps {
  return {
    store: new SupabaseConductorStore(),
    runnerFor: ({ attempt, entry }) => new GitHubActionsRunner({ repo: entry.repo, workflow: RUNNER_WORKFLOW, attempt }),
    registryEntry: async (registryId) => (await getRegistry()).get(registryId),
    now: () => new Date().toISOString(),
  };
}
