/**
 * @jest-environment node
 */
import { gateReviewSchema } from "@/lib/approvals/schema";
import { stepCompletePayloadSchema } from "@/lib/webhooks/step-complete";
import { buildSimulatedCompletion, fakeSha, parseSimulateArgs, SIMULATED_STEPS } from "../simulate";

const RUN = "6f1c2b9e-4a3d-4c1e-9b7a-2d5e8f0a1b3c";

describe("buildSimulatedCompletion", () => {
  it.each([...SIMULATED_STEPS])("builds a valid webhook payload for %s", (step) => {
    const payload = buildSimulatedCompletion({ runId: RUN, step, attempt: 1, fail: false });
    expect(stepCompletePayloadSchema.safeParse(payload).success).toBe(true);
    expect(payload.stepKey).toBe(`${RUN}:${step}:1`);
    expect(payload.output).toMatchObject({ costUsd: 0.05, sessionId: "simulated", prUrl: "https://example.com/pr/1" });
    expect(payload.output.commitSha).toMatch(/^[0-9a-f]{40}$/);
  });

  it.each(["spec", "design", "verify"] as const)("includes a valid plain-language gateReview for %s", (step) => {
    const payload = buildSimulatedCompletion({ runId: RUN, step, attempt: 1, fail: false });
    expect(gateReviewSchema.safeParse((payload.output.result as { gateReview?: unknown }).gateReview).success).toBe(true);
  });

  it.each(["build_test", "deploy", "post_deploy_check"] as const)("has no gateReview for %s", (step) => {
    expect(buildSimulatedCompletion({ runId: RUN, step, attempt: 1, fail: false }).output.result).toEqual({});
  });

  it("marks --fail as a failed step that is still a valid payload", () => {
    const payload = buildSimulatedCompletion({ runId: RUN, step: "build_test", attempt: 2, fail: true });
    expect(payload.output.status).toBe("failed");
    expect(stepCompletePayloadSchema.safeParse(payload).success).toBe(true);
  });

  it("gives a deterministic SHA that changes with the attempt", () => {
    expect(fakeSha(RUN, "spec", 1)).toBe(fakeSha(RUN, "spec", 1));
    expect(fakeSha(RUN, "spec", 1)).not.toBe(fakeSha(RUN, "spec", 2));
  });
});

describe("parseSimulateArgs", () => {
  const base = ["--url", "http://localhost:3000", "--run", RUN];

  it("accepts an explicit step", () => {
    const parsed = parseSimulateArgs([...base, "--step", "spec"]);
    expect(parsed).toMatchObject({ ok: true, args: { step: "spec", attempt: 1, fail: false } });
  });

  it("infers the step from a work state, with attempt and --fail", () => {
    const parsed = parseSimulateArgs([...base, "--state", "build_test", "--attempt", "2", "--fail"]);
    expect(parsed).toMatchObject({ ok: true, args: { step: "build_test", attempt: 2, fail: true } });
  });

  it("refuses a state that has no step", () => {
    expect(parseSimulateArgs([...base, "--state", "spec_gate"])).toMatchObject({ ok: false });
  });

  it.each(["http://127.0.0.1:3000", "http://[::1]:3000"])("allows local URL %s", (url) => {
    expect(parseSimulateArgs(["--url", url, "--run", RUN, "--step", "spec"]).ok).toBe(true);
  });

  it("refuses a remote URL without --allow-remote", () => {
    const parsed = parseSimulateArgs(["--url", "https://denkore.example.com", "--run", RUN, "--step", "spec"]);
    expect(parsed).toMatchObject({ ok: false, error: expect.stringMatching(/--allow-remote/) });
    expect(
      parseSimulateArgs(["--url", "https://denkore.example.com", "--run", RUN, "--step", "spec", "--allow-remote"]).ok,
    ).toBe(true);
  });

  it("refuses a hostname that only starts with localhost", () => {
    expect(parseSimulateArgs(["--url", "http://localhost.evil.example", "--run", RUN, "--step", "spec"]).ok).toBe(false);
  });

  it.each([
    [["--run", RUN, "--step", "spec"], /--url/],
    [["--url", "http://localhost:3000", "--run", "nope", "--step", "spec"], /UUID/],
    [[...base], /--step/],
    [[...base, "--step", "launch"], /--step must be/],
    [[...base, "--step", "spec", "--attempt", "0"], /--attempt/],
    [[...base, "--step", "spec", "--colour", "red"], /Unknown option/],
  ])("rejects %j", (argv, message) => {
    expect(parseSimulateArgs(argv as string[])).toMatchObject({ ok: false, error: expect.stringMatching(message) });
  });
});
