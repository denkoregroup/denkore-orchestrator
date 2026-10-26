import { stepInputSchema, stepKeyFor, type StepDispatch, type StepInput, type StepRunner } from "./types";

export interface GitHubActionsRunnerOptions {
  /** owner/name of the repo that hosts the agent workflow. */
  repo: string;
  workflow: string;
  ref?: string;
  /** Attempt number for the step key; defaults to 1. */
  attempt?: number;
}

/**
 * Stub runner. Builds the workflow_dispatch request it would send, but does not
 * call GitHub. Real dispatch (and token handling) is out of scope for the scaffold.
 */
export class GitHubActionsRunner implements StepRunner {
  readonly name = "github-actions";
  /** Requests that would have been sent; exposed for inspection in tests. */
  readonly dispatched: Array<{ url: string; body: unknown }> = [];

  constructor(private readonly options: GitHubActionsRunnerOptions) {}

  buildDispatchRequest(input: StepInput, stepKey: string) {
    const { repo, workflow, ref = "main" } = this.options;
    return {
      url: `https://api.github.com/repos/${repo}/actions/workflows/${workflow}/dispatches`,
      body: {
        ref,
        inputs: {
          run_id: input.runId,
          step: input.step,
          step_key: stepKey,
          branch: input.branch,
          model: input.model,
          max_turns: String(input.maxTurns),
          timeout_seconds: String(input.timeoutSeconds),
          tool_allowlist: input.toolAllowlist.join(","),
          registry_id: input.registryEntry.id,
          task: input.task,
        },
      },
    };
  }

  async dispatch(input: StepInput): Promise<StepDispatch> {
    const parsed = stepInputSchema.parse(input);
    const stepKey = stepKeyFor(parsed.runId, parsed.step, this.options.attempt ?? 1);
    this.dispatched.push(this.buildDispatchRequest(parsed, stepKey));
    return { runId: parsed.runId, step: parsed.step, stepKey };
  }
}
