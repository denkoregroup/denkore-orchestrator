import type { GateReview } from "./types";

/** Static example until approvals are read from Supabase. */
export const SAMPLE_GATE: GateReview = {
  id: "sample-release-gate",
  project: "example-app",
  kind: "release",
  approval: "pr_review",
  headline: "Customers will be able to book a table online from their phone.",
  summary:
    "The new booking page is finished and has passed every automated check. Approving this puts it live for all visitors.",
  changes: [
    "A “Book a table” button appears on the home page.",
    "Customers pick a date, time, and party size, then get a confirmation email.",
    "Staff see new bookings on the existing dashboard.",
  ],
  risks: ["Confirmation emails depend on the email provider being available."],
  technical: {
    commitSha: "3f9c2a1e7b4d6c8f0a2e4b6d8f0a1c3e5b7d9f1a",
    branch: "denkore/run-booking-flow",
    prUrl: "https://github.com/denkoregroup/example-app/pull/42",
    checks: [
      { name: "typecheck", status: "passed" },
      { name: "unit tests", status: "passed" },
      { name: "critical flows", status: "passed" },
    ],
    filesChanged: 14,
    costUsd: 3.27,
  },
};
