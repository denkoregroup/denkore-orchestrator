import { z } from "zod";
import { RUN_STATES } from "@/lib/state-machine/states";
import { STEP_NAMES } from "@/lib/step-runner/types";

// Row shapes as PostgREST returns them. Parsing at the boundary makes schema
// drift fail loudly instead of rendering wrong data.

/** PostgREST may return numeric and bigint columns as JSON numbers or strings. */
const numeric = z.union([z.number(), z.string().regex(/^-?\d+(\.\d+)?$/).transform(Number)]);
const bigintId = z.union([z.number().int(), z.string().regex(/^\d+$/).transform(Number)]);
const sha = z.string().regex(/^[0-9a-f]{7,40}$/);

export const projectRow = z.object({
  id: z.uuid(),
  registry_id: z.string().min(1),
  repo: z.string().min(1),
  created_at: z.string(),
});
export type ProjectRow = z.infer<typeof projectRow>;
export const PROJECT_COLUMNS = "id, registry_id, repo, created_at";

export const runRow = z.object({
  id: z.uuid(),
  project_id: z.uuid(),
  state: z.enum(RUN_STATES),
  prompt: z.string(),
  test_failures: z.number().int(),
  max_test_retries: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
});
export type RunRow = z.infer<typeof runRow>;
export const RUN_COLUMNS =
  "id, project_id, state, prompt, test_failures, max_test_retries, created_at, updated_at";

export const stepRow = z.object({
  id: z.uuid(),
  run_id: z.uuid(),
  step: z.enum(STEP_NAMES),
  attempt: z.number().int(),
  status: z.enum(["dispatched", "succeeded", "failed"]),
  /** The step output's `result` object (see record_step_completion in 003). */
  output: z.record(z.string(), z.unknown()).nullable(),
  commit_sha: sha.nullable(),
  pr_url: z.string().nullable(),
  cost_usd: numeric.nullable(),
  dispatched_at: z.string(),
  completed_at: z.string().nullable(),
});
export type StepRow = z.infer<typeof stepRow>;
export const STEP_COLUMNS =
  "id, run_id, step, attempt, status, output, commit_sha, pr_url, cost_usd, dispatched_at, completed_at";

export const gateRow = z.object({
  id: z.uuid(),
  run_id: z.uuid(),
  kind: z.enum(["spec", "design", "release"]),
  commit_sha: sha,
  status: z.enum(["pending", "approved", "changes_requested"]),
  created_at: z.string(),
  updated_at: z.string(),
});
export type GateRow = z.infer<typeof gateRow>;
export const GATE_COLUMNS = "id, run_id, kind, commit_sha, status, created_at, updated_at";

export const gateStatusRow = z.object({
  gate_id: z.uuid(),
  run_id: z.uuid(),
  kind: z.enum(["spec", "design", "release"]),
  commit_sha: sha,
  status: z.enum(["pending", "approved", "changes_requested"]),
});
export type GateStatusRow = z.infer<typeof gateStatusRow>;
export const GATE_STATUS_COLUMNS = "gate_id, run_id, kind, commit_sha, status";

export const eventRow = z.object({
  id: bigintId,
  run_id: z.uuid().nullable(),
  kind: z.string(),
  payload: z.unknown(),
  actor: z.string(),
  created_at: z.string(),
});
export type EventRow = z.infer<typeof eventRow>;
export const EVENT_COLUMNS = "id, run_id, kind, payload, actor, created_at";

export class SchemaDriftError extends Error {
  constructor(table: string, issues: string) {
    super(`Unexpected ${table} row shape: ${issues}`);
    this.name = "SchemaDriftError";
  }
}

export function parseRows<S extends z.ZodType>(schema: S, rows: unknown, table: string): z.infer<S>[] {
  const result = z.array(schema).safeParse(rows ?? []);
  if (!result.success) throw new SchemaDriftError(table, z.prettifyError(result.error));
  return result.data;
}

export function parseRow<S extends z.ZodType>(schema: S, row: unknown, table: string): z.infer<S> {
  const result = schema.safeParse(row);
  if (!result.success) throw new SchemaDriftError(table, z.prettifyError(result.error));
  return result.data;
}

export class QueryError extends Error {
  constructor(
    what: string,
    readonly code: string | undefined,
    message: string,
  ) {
    super(`${what} failed: ${message}`);
    this.name = "QueryError";
  }
}

export function queryError(what: string, error: { code?: string; message: string }): QueryError {
  return new QueryError(what, error.code, error.message);
}
