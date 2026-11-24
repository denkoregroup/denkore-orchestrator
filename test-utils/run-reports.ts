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
