/**
 * Builds fake step completions for hand testing (pnpm conductor:simulate).
 * Imports only Node built-ins: the script runs under ts-node, without the @/ alias.
 */
import { createHash } from "node:crypto";

export const SIMULATED_STEPS = ["spec", "design", "build_test", "verify", "deploy", "post_deploy_check"] as const;
export type SimulatedStep = (typeof SIMULATED_STEPS)[number];

const GATE_REVIEWS: Partial<Record<SimulatedStep, { headline: string; summary: string; changes: string[]; risks: string[] }>> = {
  spec: {
    headline: "The plan for this work is ready for your OK.",
    summary: "This is a simulated plan. It describes what will be built and how you will know it works.",
    changes: ["Adds the page described in your request.", "Adds a simple way to check it works."],
    risks: ["This is test data from the simulator, not a real plan."],
  },
  design: {
    headline: "The design is ready for your OK.",
    summary: "This is a simulated design. It shows how the page will look on a phone and on a laptop.",
    changes: ["Uses the project's existing colors and type.", "Keeps every button large enough to tap."],
    risks: ["This is test data from the simulator, not a real design."],
  },
  verify: {
    headline: "The work passed its final checks and is ready to go live.",
    summary: "This is a simulated result. All checks passed and the change is ready for your OK to go live.",
    changes: ["The new page goes live for all visitors."],
    risks: ["This is test data from the simulator; nothing real will go live."],
  },
};

/** The same run, step and attempt always give the same 40-character hex SHA. */
export function fakeSha(runId: string, step: SimulatedStep, attempt: number): string {
  return createHash("sha1").update(`${runId}:${step}:${attempt}`).digest("hex");
}

export function buildSimulatedCompletion(input: {
  runId: string;
  step: SimulatedStep;
  attempt: number;
  fail: boolean;
}) {
  const gateReview = GATE_REVIEWS[input.step];
  return {
    runId: input.runId,
    stepKey: `${input.runId}:${input.step}:${input.attempt}`,
    step: input.step,
    output: {
      status: input.fail ? ("failed" as const) : ("succeeded" as const),
      result: input.fail ? { error: "Simulated failure." } : gateReview ? { gateReview } : {},
      commitSha: fakeSha(input.runId, input.step, input.attempt),
      prUrl: "https://example.com/pr/1",
      costUsd: 0.05,
      sessionId: "simulated",
    },
  };
}

/** Work states share their step's name; gate and terminal states have no step to complete. */
export function stepFromState(state: string): SimulatedStep | null {
  return (SIMULATED_STEPS as readonly string[]).includes(state) ? (state as SimulatedStep) : null;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function isLocalUrl(url: URL): boolean {
  return LOCAL_HOSTS.has(url.hostname);
}

export interface SimulateArgs {
  url: URL;
  runId: string;
  step: SimulatedStep;
  attempt: number;
  fail: boolean;
}

export const USAGE =
  "Usage: pnpm conductor:simulate --url <app base url> --run <run id> (--step <name> | --state <run state>) [--attempt <n>] [--fail] [--allow-remote]";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseSimulateArgs(argv: string[]): { ok: true; args: SimulateArgs } | { ok: false; error: string } {
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) return { ok: false, error: `Unexpected argument: ${arg}` };
    const name = arg.slice(2);
    if (name === "fail" || name === "allow-remote") flags.set(name, true);
    else {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) return { ok: false, error: `--${name} needs a value` };
      flags.set(name, value);
      i++;
    }
  }
  const known = new Set(["url", "run", "step", "state", "attempt", "fail", "allow-remote"]);
  for (const name of flags.keys()) if (!known.has(name)) return { ok: false, error: `Unknown option --${name}` };

  const rawUrl = flags.get("url");
  if (typeof rawUrl !== "string") return { ok: false, error: "--url is required" };
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return { ok: false, error: `Not a URL: ${rawUrl}` };
  }
  if (!isLocalUrl(url) && flags.get("allow-remote") !== true) {
    return { ok: false, error: `Refusing to post to ${url.host}: only localhost is allowed without --allow-remote` };
  }

  const runId = flags.get("run");
  if (typeof runId !== "string" || !UUID.test(runId)) return { ok: false, error: "--run must be a run ID (UUID)" };

  const rawStep = flags.get("step");
  const rawState = flags.get("state");
  let step: SimulatedStep | null = null;
  if (typeof rawStep === "string") {
    step = stepFromState(rawStep);
    if (!step) return { ok: false, error: `--step must be one of: ${SIMULATED_STEPS.join(", ")}` };
  } else if (typeof rawState === "string") {
    step = stepFromState(rawState);
    if (!step) return { ok: false, error: `State "${rawState}" has no step to complete (it is waiting on you, or finished)` };
  } else {
    return { ok: false, error: "Pass --step <name> or --state <run state>" };
  }

  const rawAttempt = flags.get("attempt") ?? "1";
  const attempt = typeof rawAttempt === "string" ? Number(rawAttempt) : NaN;
  if (!Number.isInteger(attempt) || attempt < 1) return { ok: false, error: "--attempt must be a whole number from 1" };

  return { ok: true, args: { url, runId, step, attempt, fail: flags.get("fail") === true } };
}
