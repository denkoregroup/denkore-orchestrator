import type { RunReport } from "@/lib/run-reports/schema";

/** A valid report from a HoneyBee run. Override any field. */
export function runReport(overrides: Partial<RunReport> = {}): RunReport {
  return {
    schemaVersion: 1,
    registryId: "honeybees",
    repo: "denkoregroup/honeybees",
    mode: "may-start",
    startedAt: "2026-11-24T11:42:00.000Z",
    finishedAt: "2026-11-24T12:10:00.000Z",
    summary: "Fixed the cart badge and opened the shipping page. Both wait on your merge.",
    sessionUrl: "https://claude.ai/code/session_01ExampleNotReal",
    pulls: [
      { number: 51, title: "Cart badge counts items", what: "The cart icon shows how many items are in the cart", checks: "passing", ready: true },
      { number: 52, title: "Shipping page", what: "A page with shipping times and costs", checks: "running", ready: false },
    ],
    notes: ["The second Vercel status on every PR is from the old team and always fails; it can be ignored."],
    decisions: [
      { number: 1, question: "Should the shipping page list international rates?", options: ["Yes", "US only"] },
      { number: 2, question: "Take the product reviews item next?" },
    ],
    ...overrides,
  };
}

export const REVIEWED_SHA = "a".repeat(40);

/** A valid Conductor review report on two HoneyBee PRs. Override any field. */
export function reviewReport(overrides: Partial<RunReport> = {}): RunReport {
  return runReport({
    mode: "review",
    startedAt: "2026-11-25T00:37:00.000Z",
    finishedAt: "2026-11-25T00:55:00.000Z",
    summary: "Reviewed two PRs: one ready, one needs your eyes on the preview.",
    pulls: [
      {
        number: 51,
        title: "Cart badge counts items",
        what: "The cart icon shows how many items are in the cart",
        checks: "passing",
        ready: true,
        review: { verdict: "ready", headSha: REVIEWED_SHA },
      },
      {
        number: 52,
        title: "Shipping page",
        what: "A page with shipping times and costs",
        checks: "passing",
        ready: false,
        review: { verdict: "needs-david", reason: "Check the shipping times against Sarah's text", headSha: "b".repeat(40) },
      },
    ],
    notes: [],
    decisions: [],
    ...overrides,
  });
}
