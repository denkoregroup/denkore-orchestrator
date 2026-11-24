/**
 * @jest-environment node
 *
 * Guards .github/workflows/run-answers.yml: started by hand (or by a run) only, read-only
 * permissions, pinned actions, the project in the run's name, and every input passed through the
 * environment, never pasted into a shell command.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";

const raw = readFileSync(path.join(process.cwd(), ".github", "workflows", "run-answers.yml"), "utf8");
const workflow = parse(raw) as {
  on: Record<string, { inputs?: Record<string, { required: boolean; type: string }> }>;
  "run-name": string;
  permissions: unknown;
  jobs: Record<string, { "timeout-minutes": number; permissions?: unknown; steps: Array<{ uses?: string; run?: string; env?: Record<string, string> }> }>;
};
const jobs = Object.values(workflow.jobs);
const steps = jobs.flatMap((j) => j.steps);

describe("run-answers workflow", () => {
  it("only starts by dispatch, with one required registry id", () => {
    expect(Object.keys(workflow.on)).toEqual(["workflow_dispatch"]);
    expect(workflow.on.workflow_dispatch.inputs).toEqual({
      registry_id: expect.objectContaining({ required: true, type: "string" }),
    });
  });

  it("names each run after its project, which is how a scheduled run finds its own", () => {
    expect(workflow["run-name"]).toBe("Run answers for ${{ inputs.registry_id }}");
  });

  it("grants nothing at the workflow level and only read access to its job", () => {
    expect(workflow.permissions).toEqual({});
    for (const job of jobs) expect(job.permissions).toEqual({ contents: "read" });
    for (const job of jobs) expect(job["timeout-minutes"]).toBe(3);
  });

  it("pins every action to a 40-character commit SHA", () => {
    const lines = raw.split("\n").filter((l) => /^\s*-?\s*uses:/.test(l));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(line).toMatch(/@[0-9a-f]{40} # v\d+(\.\d+)*$/);
  });

  it("never puts an expression inside a shell command", () => {
    for (const s of steps) if (s.run) expect(s.run).not.toContain("${{");
  });

  it("passes the project, the address and the secret only through the environment", () => {
    const fetch = steps.find((s) => s.run === "node scripts/fetch-run-answers.mjs");
    expect(fetch?.env).toEqual({
      REGISTRY_ID: "${{ inputs.registry_id }}",
      RUN_ANSWERS_URL: "${{ vars.RUN_ANSWERS_URL }}",
      CONDUCTOR_TICK_URL: "${{ vars.CONDUCTOR_TICK_URL }}",
      STEP_WEBHOOK_SECRET: "${{ secrets.STEP_WEBHOOK_SECRET }}",
    });
  });
});
