/**
 * What a scheduled Duet run sends the app when it finishes: the run's PR table,
 * its notes and its numbered decisions, as in docs/agents/scheduled-run.md.
 *
 * Every field is plain text that the pages render as text, never as HTML or
 * markdown. The only links the pages build are to GitHub pull requests (from
 * `repo` and a PR number) and to the run's own Claude session.
 */
import { z } from "zod";

const text = (max: number) => z.string().trim().min(1).max(max);

export const RUN_MODES = ["finish-only", "may-start"] as const;
export const PR_CHECKS = ["passing", "failing", "running", "none"] as const;

/** A Claude session address, the only kind of link a report may carry. */
const sessionUrl = z
  .url({ protocol: /^https$/, hostname: /^claude\.ai$/ })
  .refine((u) => new URL(u).pathname.startsWith("/code/"), "must be a claude.ai/code session address");

export const runReportPullSchema = z.strictObject({
  number: z.number().int().positive(),
  title: text(200),
  /** What the PR does, product-owner level. */
  what: text(300),
  checks: z.enum(PR_CHECKS),
  /** The run's view: true when it's ready for David's merge. */
  ready: z.boolean(),
});

export const runReportDecisionSchema = z.strictObject({
  /** The number David answers with in the run's session. */
  number: z.number().int().positive(),
  question: text(500),
  /** Short answers to pick from, when the run offers them. */
  options: z.array(text(120)).max(5).optional(),
});

export const runReportSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    /** The registry entry the run worked on (registry/<id>.yaml). */
    registryId: z.string().regex(/^[a-z0-9-]+$/),
    /** owner/name, which must match that registry entry's repo. */
    repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/, "owner/name"),
    mode: z.enum(RUN_MODES),
    startedAt: z.iso.datetime({ offset: true }),
    finishedAt: z.iso.datetime({ offset: true }),
    /** One or two sentences: what the run did and what it waits on. */
    summary: text(600),
    sessionUrl: sessionUrl.optional(),
    pulls: z.array(runReportPullSchema).max(30),
    notes: z.array(text(400)).max(5),
    decisions: z.array(runReportDecisionSchema).max(10),
  })
  .refine((r) => Date.parse(r.finishedAt) >= Date.parse(r.startedAt), {
    path: ["finishedAt"],
    message: "finishedAt must not be before startedAt",
  })
  .refine((r) => new Set(r.decisions.map((d) => d.number)).size === r.decisions.length, {
    path: ["decisions"],
    message: "decision numbers must be unique",
  });

export type RunReport = z.infer<typeof runReportSchema>;
export type RunReportPull = z.infer<typeof runReportPullSchema>;
export type RunReportDecision = z.infer<typeof runReportDecisionSchema>;
