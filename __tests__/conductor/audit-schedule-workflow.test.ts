/**
 * @jest-environment node
 *
 * Guards .github/workflows/audit-schedule.yml: daily schedule, permissions (like
 * conductor-tick.yml), pinned actions, and where the address and the secret come from.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";

const raw = readFileSync(path.join(process.cwd(), ".github", "workflows", "audit-schedule.yml"), "utf8");
const workflow = parse(raw) as {
  on: { schedule?: Array<{ cron: string }>; workflow_dispatch?: unknown };
  permissions: unknown;
  concurrency: { group: string; "cancel-in-progress": boolean };
  jobs: Record<string, { "timeout-minutes": number; permissions?: unknown; steps: Array<{ uses?: string; run?: string; env?: Record<string, string> }> }>;
};
const jobs = Object.values(workflow.jobs);
const steps = jobs.flatMap((j) => j.steps);

describe("audit-schedule workflow", () => {
  it("runs once a day and by hand", () => {
    expect(workflow.on.schedule).toHaveLength(1);
    // minute hour * * *: a fixed time, every day
    expect(workflow.on.schedule![0].cron).toMatch(/^\d{1,2} \d{1,2} \* \* \*$/);
    expect("workflow_dispatch" in workflow.on).toBe(true);
  });

  it("matches conductor-tick.yml: no permissions at the top, read-only contents for the job", () => {
    expect(workflow.permissions).toEqual({});
    for (const job of jobs) expect(job.permissions).toEqual({ contents: "read" });
  });

  it("never runs two audits at once and never cancels one mid-flight", () => {
    expect(workflow.concurrency).toEqual({ group: "audit-schedule", "cancel-in-progress": false });
  });

  it("stops a stuck job", () => {
    for (const job of jobs) expect(job["timeout-minutes"]).toBeLessThanOrEqual(60);
  });

  it("pins every action to a 40-character commit SHA, with the version in a comment", () => {
    const uses = steps.filter((s) => s.uses).map((s) => s.uses!);
    expect(uses.length).toBeGreaterThan(0);
    for (const ref of uses) expect(ref).toMatch(/^[\w.-]+\/[\w.-]+(\/[\w./-]+)?@[0-9a-f]{40}$/);
    for (const line of raw.split("\n").filter((l) => /^\s*-?\s*uses:/.test(l))) expect(line).toMatch(/@[0-9a-f]{40} # v\d+(\.\d+)*$/);
  });

  it("runs audit:schedule with the address from a repository variable and the secret the ingest route already checks", () => {
    const run = steps.find((s) => s.run === "pnpm audit:schedule");
    expect(run?.env).toEqual({
      AUDIT_REPORT_URL: "${{ vars.AUDIT_REPORT_URL }}",
      STEP_WEBHOOK_SECRET: "${{ secrets.STEP_WEBHOOK_SECRET }}",
    });
  });

  it("is not told to continue after a failure, so the run shows red when a site failed", () => {
    expect(raw).not.toMatch(/continue-on-error/);
    expect(raw).not.toMatch(/\|\|\s*true/);
  });
});
