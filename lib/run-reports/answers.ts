/**
 * David's answers to a run's numbered decisions, typed on the Waiting on you page.
 *
 * Each answer is one row in `events` (kind `run.answered`, no run), so it also shows in Activity.
 * The `idempotency_key` makes it one answer per decision. The next scheduled run on that project
 * fetches the answers to the newest report before it starts work, through the Run answers
 * workflow, which signs the request: runs never hold the secret.
 */
import { z } from "zod";
import { SIGNATURE_HEADER, verifySignature } from "@/lib/webhooks/signature";
import { MAX_ANSWER_LENGTH } from "./answer-copy";
import type { RepoOf } from "./ingest";

export const RUN_ANSWERED_EVENT = "run.answered";

/** One answer per decision of a report. */
export function answerKey(runReportId: string, decisionNumber: number) {
  return `${RUN_ANSWERED_EVENT}:${runReportId}:${decisionNumber}`;
}

/** What the page's form sends. Whitespace, line breaks included, becomes single spaces. */
export const answerFormSchema = z.object({
  registryId: z.string().regex(/^[a-z0-9-]+$/),
  runReportId: z.uuid(),
  decisionNumber: z.coerce.number().int().positive(),
  answer: z
    .string()
    .transform((s) => s.replace(/\s+/g, " ").trim())
    .pipe(z.string().min(1).max(MAX_ANSWER_LENGTH)),
});

/** The payload stored on the event. */
export const answerPayloadSchema = z.object({
  run_report_id: z.uuid(),
  registry_id: z.string(),
  decision_number: z.number().int().positive(),
  question: z.string(),
  answer: z.string(),
});
export type AnswerPayload = z.infer<typeof answerPayloadSchema>;

export interface RunAnswer {
  number: number;
  question: string;
  answer: string;
  answeredAt: string;
}

export interface AnswersForProject {
  /** When the newest reported run started; null when the project has no report. */
  runStartedAt: string | null;
  answers: RunAnswer[];
}

export interface RunAnswerStore {
  /** The answers to the newest report from this project's runs. */
  answersFor(registryId: string): Promise<AnswersForProject>;
}

/** A request is one small JSON object. */
export const MAX_REQUEST_BYTES = 1024;

const requestSchema = z.strictObject({ registryId: z.string().regex(/^[a-z0-9-]+$/) });

function json(body: unknown, status: number) {
  return Response.json(body, { status });
}

/**
 * POST /api/conductor/run-answers. Signed like the run-report route: HMAC-SHA256 of the raw body
 * with STEP_WEBHOOK_SECRET. Answers with David's answers to the newest report of a registered
 * project. Reads only; it stores nothing.
 */
export function createRunAnswersHandler(deps: { secret: string | undefined; repoOf: RepoOf; store: () => RunAnswerStore }) {
  return async function handle(request: Request): Promise<Response> {
    if (!deps.secret) return json({ error: "run answers not configured" }, 500);

    const rawBody = await request.text();
    if (!verifySignature(rawBody, request.headers.get(SIGNATURE_HEADER), deps.secret)) {
      return json({ error: "invalid signature" }, 401);
    }
    if (Buffer.byteLength(rawBody, "utf8") > MAX_REQUEST_BYTES) return json({ error: "request too large" }, 413);

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return json({ error: "invalid JSON" }, 400);
    }
    const body = requestSchema.safeParse(parsed);
    if (!body.success) return json({ error: "invalid payload", issues: body.error.issues }, 400);

    if (!(await deps.repoOf()).has(body.data.registryId)) {
      return json({ error: `unknown project "${body.data.registryId}"` }, 400);
    }

    const found = await deps.store().answersFor(body.data.registryId);
    return json({ registryId: body.data.registryId, ...found }, 200);
  };
}

/** In-memory store for tests. */
export class MemoryRunAnswerStore implements RunAnswerStore {
  constructor(readonly byProject: Record<string, AnswersForProject> = {}) {}

  async answersFor(registryId: string) {
    return this.byProject[registryId] ?? { runStartedAt: null, answers: [] };
  }
}
