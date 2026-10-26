/**
 * @jest-environment node
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseRegistryEntry } from "@/lib/registry";
import { GitHubActionsRunner, stepOutputSchema, type StepInput } from "..";

async function input(): Promise<StepInput> {
  const source = await readFile(path.join(process.cwd(), "registry", "example-app.yaml"), "utf8");
  return {
    runId: "6f1c2b9e-4a3d-4c1e-9b7a-2d5e8f0a1b3c",
    step: "spec",
    registryEntry: parseRegistryEntry(source),
    task: "Draft the spec for the booking flow",
    toolAllowlist: ["Read", "Edit"],
    model: "example-model",
    maxTurns: 40,
    timeoutSeconds: 1800,
    branch: "denkore/run-123",
  };
}

describe("GitHubActionsRunner (stub)", () => {
  it("builds a workflow_dispatch request and returns a step key", async () => {
    const runner = new GitHubActionsRunner({ repo: "denkoregroup/agents", workflow: "step.yml" });
    const dispatch = await runner.dispatch(await input());
    expect(dispatch.stepKey).toBe("6f1c2b9e-4a3d-4c1e-9b7a-2d5e8f0a1b3c:spec:1");
    expect(runner.dispatched).toHaveLength(1);
    expect(runner.dispatched[0].url).toBe(
      "https://api.github.com/repos/denkoregroup/agents/actions/workflows/step.yml/dispatches",
    );
  });

  it("rejects invalid input", async () => {
    const runner = new GitHubActionsRunner({ repo: "denkoregroup/agents", workflow: "step.yml" });
    await expect(runner.dispatch({ ...(await input()), maxTurns: 0 })).rejects.toThrow();
  });
});

describe("stepOutputSchema", () => {
  const base = { status: "succeeded", result: {}, costUsd: 0, sessionId: "s" };

  it("requires a commit SHA or a PR link", () => {
    expect(stepOutputSchema.safeParse(base).success).toBe(false);
    expect(stepOutputSchema.safeParse({ ...base, commitSha: "abcdef1" }).success).toBe(true);
    expect(
      stepOutputSchema.safeParse({ ...base, prUrl: "https://github.com/o/r/pull/1" }).success,
    ).toBe(true);
  });

  it("rejects a negative cost", () => {
    expect(stepOutputSchema.safeParse({ ...base, commitSha: "abcdef1", costUsd: -1 }).success).toBe(
      false,
    );
  });
});
