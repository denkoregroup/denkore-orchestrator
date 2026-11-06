/**
 * @jest-environment node
 *
 * Guards .github/workflows/conductor-tick.yml: schedule, permissions, and
 * that every action is pinned to a full commit SHA.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";

const FILE = path.join(process.cwd(), ".github", "workflows", "conductor-tick.yml");
const raw = readFileSync(FILE, "utf8");
const workflow = parse(raw) as {
  on: { schedule?: Array<{ cron: string }>; workflow_dispatch?: unknown };
  permissions: unknown;
  concurrency: { group: string; "cancel-in-progress": boolean };
  jobs: Record<string, { "timeout-minutes": number; permissions?: unknown; steps: Array<{ uses?: string; run?: string; env?: Record<string, string> }> }>;
};
const jobs = Object.values(workflow.jobs);
const steps = jobs.flatMap((j) => j.steps);

describe("conductor-tick workflow", () => {
  it("runs on a 5-minute cron and by hand", () => {
    expect(workflow.on.schedule).toEqual([{ cron: "*/5 * * * *" }]);
    expect("workflow_dispatch" in workflow.on).toBe(true);
  });

  it("grants no permissions at the workflow level", () => {
    expect(workflow.permissions).toEqual({});
  });

  it("gives its job only read access to the repository, for checkout", () => {
    for (const job of jobs) expect(job.permissions).toEqual({ contents: "read" });
  });

  it("never runs two ticks at once and never cancels one mid-flight", () => {
    expect(workflow.concurrency).toEqual({ group: "conductor-tick", "cancel-in-progress": false });
  });

  it("stops a stuck job after 3 minutes", () => {
    for (const job of jobs) expect(job["timeout-minutes"]).toBe(3);
  });

  it("pins every action to a 40-character commit SHA, with the version in a comment", () => {
    const uses = steps.filter((s) => s.uses).map((s) => s.uses!);
    expect(uses.length).toBeGreaterThan(0);
    for (const ref of uses) expect(ref).toMatch(/^[\w.-]+\/[\w.-]+(\/[\w./-]+)?@[0-9a-f]{40}$/);
    const lines = raw.split("\n").filter((l) => /^\s*-?\s*uses:/.test(l));
    for (const line of lines) expect(line).toMatch(/@[0-9a-f]{40} # v\d+(\.\d+)*$/);
  });

  it("runs the script with the URL from a repo variable and the secret from a repo secret", () => {
    const run = steps.find((s) => s.run?.includes("scripts/post-tick.mjs"));
    expect(run?.env).toEqual({
      TICK_URL: "${{ vars.CONDUCTOR_TICK_URL }}",
      STEP_WEBHOOK_SECRET: "${{ secrets.STEP_WEBHOOK_SECRET }}",
    });
  });
});
