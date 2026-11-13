/**
 * @jest-environment node
 *
 * Guards .github/workflows/supabase-migrations.yml: by hand only, nothing on merge, read-only
 * permissions, pinned actions, and a dry run that lists pending migrations before the real push.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";

const raw = readFileSync(path.join(process.cwd(), ".github", "workflows", "supabase-migrations.yml"), "utf8");
const workflow = parse(raw) as {
  on: Record<string, unknown>;
  permissions: unknown;
  jobs: Record<string, { "timeout-minutes": number; permissions?: unknown; env?: Record<string, string>; steps: Array<{ name?: string; uses?: string; run?: string }> }>;
};
const jobs = Object.values(workflow.jobs);
const steps = jobs.flatMap((j) => j.steps);

describe("supabase-migrations workflow", () => {
  it("runs only when started by hand", () => {
    expect(Object.keys(workflow.on)).toEqual(["workflow_dispatch"]);
  });

  it("has no permissions at the top and read-only contents for the job", () => {
    expect(workflow.permissions).toEqual({});
    for (const job of jobs) expect(job.permissions).toEqual({ contents: "read" });
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

  it("reads the two secrets and the project ref from where the README says", () => {
    for (const job of jobs) {
      expect(job.env).toEqual({
        SUPABASE_ACCESS_TOKEN: "${{ secrets.SUPABASE_ACCESS_TOKEN }}",
        SUPABASE_DB_PASSWORD: "${{ secrets.SUPABASE_DB_PASSWORD }}",
        SUPABASE_PROJECT_REF: "${{ vars.SUPABASE_PROJECT_REF }}",
      });
    }
  });

  it("links the project, lists pending migrations with a dry run, and only then pushes", () => {
    const runs = steps.map((s) => s.run).filter(Boolean);
    const dryRun = runs.findIndex((r) => r!.includes("db push") && r!.includes("--dry-run"));
    const push = runs.findIndex((r) => r!.includes("db push") && !r!.includes("--dry-run"));
    expect(dryRun).toBeGreaterThan(-1);
    expect(push).toBeGreaterThan(dryRun);
    expect(runs.some((r) => r!.includes('supabase link --project-ref "$SUPABASE_PROJECT_REF"'))).toBe(true);
  });

  it("answers the hosted-change prompt with --yes on the apply step only, and leaves the dry run as it was", () => {
    const runs = steps.map((s) => s.run).filter(Boolean);
    expect(runs).toContain("pnpm exec supabase db push --dry-run --remote");
    expect(runs).toContain("pnpm exec supabase db push --remote --yes");
    expect(runs.filter((r) => r!.includes("--yes"))).toEqual(["pnpm exec supabase db push --remote --yes"]);
  });

  it("never pushes seed data or roles to production", () => {
    expect(raw).not.toMatch(/--include-seed|--include-roles|--include-all/);
  });
});
