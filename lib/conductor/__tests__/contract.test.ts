/**
 * @jest-environment node
 */
import path from "node:path";
import { loadRegistry } from "@/lib/registry/loader";
import { stepInputSchema, STEP_NAMES } from "@/lib/step-runner/types";
import { branchFor, buildStepInput, SHIP_AND_LOG_RULE, TOOL_ALLOWLISTS } from "../contract";
import { LIMITS } from "../limits";

const RUN = "6f1c2b9e-4a3d-4c1e-9b7a-2d5e8f0a1b3c";

describe("agent contract", () => {
  it("names the branch cast/<first 8 of run id>", () => {
    expect(branchFor(RUN)).toBe("cast/6f1c2b9e");
  });

  it("has an allowlist for every step", () => {
    expect(Object.keys(TOOL_ALLOWLISTS).sort()).toEqual([...STEP_NAMES].sort());
    expect(TOOL_ALLOWLISTS.build_test).toEqual(
      expect.arrayContaining(["Read", "Grep", "Glob", "Write", "Edit", "Bash(pnpm *)", "Bash(git *)"]),
    );
    expect(TOOL_ALLOWLISTS.verify).not.toContain("Write");
  });

  it.each([...STEP_NAMES])("builds a valid step input for %s", async (step) => {
    const entry = (await loadRegistry(path.join(process.cwd(), "registry"))).get("example-app")!;
    const input = buildStepInput({ runId: RUN, step, prompt: "Build the booking page", entry, ownerNote: "Bigger buttons" });
    expect(stepInputSchema.safeParse(input).success).toBe(true);
    expect(input).toMatchObject({ maxTurns: LIMITS.maxTurns, timeoutSeconds: LIMITS.stepTimeoutSeconds, branch: "cast/6f1c2b9e" });
    expect(input.task).toContain("Build the booking page");
    expect(input.task).toContain(entry.constraints[0]);
    expect(input.task).toContain("Bigger buttons");
    expect(input.task).toContain(SHIP_AND_LOG_RULE);
  });

  it("states the ship-and-log rule verbatim", () => {
    expect(SHIP_AND_LOG_RULE).toBe(
      "Blockers (security, production deploys, infrastructure, SQL or data changes, claims in client content, anything involving AB, Shepp or other outside parties) must stop and escalate. Everything else: take a sensible default, log the open question as a backlog improvement, and keep going. Do not perfect; ship and log.",
    );
  });
});
