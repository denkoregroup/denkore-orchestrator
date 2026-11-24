import { runReportSchema, type RunReport } from "./schema";
import { SIGNATURE_HEADER, verifySignature } from "@/lib/webhooks/signature";

/** A body larger than this is refused before parsing. A full report is a few KB. */
export const MAX_BODY_BYTES = 64 * 1024;

export interface RunReportStore {
  /** Stores the report. "duplicate" when the same repo and start time is already stored. */
  record(report: RunReport): Promise<{ status: "recorded" | "duplicate" }>;
}

/** registry id -> repo (owner/name), for the registered projects. */
export type RepoOf = () => Promise<Map<string, string>>;

function json(body: unknown, status: number) {
  return Response.json(body, { status });
}

/**
 * POST /api/conductor/run-report. Signed like the tick route and the audit
 * reports: HMAC-SHA256 of the raw body with STEP_WEBHOOK_SECRET. The Duet runs
 * never hold that secret; they start the Run report workflow, which signs.
 */
export function createRunReportHandler(deps: { secret: string | undefined; repoOf: RepoOf; store: () => RunReportStore }) {
  return async function handle(request: Request): Promise<Response> {
    if (!deps.secret) return json({ error: "run reports not configured" }, 500);

    const rawBody = await request.text();
    if (!verifySignature(rawBody, request.headers.get(SIGNATURE_HEADER), deps.secret)) {
      return json({ error: "invalid signature" }, 401);
    }
    if (Buffer.byteLength(rawBody, "utf8") > MAX_BODY_BYTES) return json({ error: "report too large" }, 413);

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return json({ error: "invalid JSON" }, 400);
    }
    const report = runReportSchema.safeParse(parsed);
    if (!report.success) return json({ error: "invalid payload", issues: report.error.issues }, 400);

    // Only registered projects, and only the repo the registry names for them.
    const repo = (await deps.repoOf()).get(report.data.registryId);
    if (!repo) return json({ error: `unknown project "${report.data.registryId}"` }, 400);
    if (repo.toLowerCase() !== report.data.repo.toLowerCase()) {
      return json({ error: `project "${report.data.registryId}" is ${repo}, not ${report.data.repo}` }, 400);
    }

    const { status } = await deps.store().record(report.data);
    return json({ status, registryId: report.data.registryId, startedAt: report.data.startedAt }, 200);
  };
}

/** In-memory store for tests. */
export class MemoryRunReportStore implements RunReportStore {
  readonly reports: RunReport[] = [];

  async record(report: RunReport) {
    const exists = this.reports.some(
      (r) => r.repo.toLowerCase() === report.repo.toLowerCase() && Date.parse(r.startedAt) === Date.parse(report.startedAt),
    );
    if (exists) return { status: "duplicate" as const };
    this.reports.push(report);
    return { status: "recorded" as const };
  }
}
