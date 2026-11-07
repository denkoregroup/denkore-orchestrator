import { z } from "zod";
import { auditReportSchema, type AuditReport } from "@/lib/audits/types";
import { SIGNATURE_HEADER, verifySignature } from "@/lib/webhooks/signature";

export const reportPayloadSchema = z.strictObject({
  /** The registry entry the audit was run for (`--project`). Absent for a plain `--url` audit. */
  registryId: z.string().min(1).optional(),
  report: auditReportSchema,
});

export type ReportPayload = z.infer<typeof reportPayloadSchema>;

export interface ReportStore {
  /**
   * Stores the report, linked to the project whose registry id is `registryId`
   * when there is one. Returns "duplicate" without a second row if a report
   * for the same target and start time is already stored.
   */
  record(payload: ReportPayload): Promise<{ status: "recorded" | "duplicate"; projectLinked: boolean }>;
}

function json(body: unknown, status: number) {
  return Response.json(body, { status });
}

/**
 * POST /api/audits/report. Signed like the step-complete webhook and the tick
 * route: HMAC-SHA256 of the raw body with STEP_WEBHOOK_SECRET.
 */
export function createReportHandler(deps: { secret: string | undefined; store: () => ReportStore }) {
  return async function handle(request: Request): Promise<Response> {
    if (!deps.secret) return json({ error: "audit reports not configured" }, 500);

    // Verify against the exact bytes received, before any parsing.
    const rawBody = await request.text();
    if (!verifySignature(rawBody, request.headers.get(SIGNATURE_HEADER), deps.secret)) {
      return json({ error: "invalid signature" }, 401);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      return json({ error: "invalid JSON" }, 400);
    }
    // A report with any schemaVersion but 1 fails here, naming report.schemaVersion.
    const payload = reportPayloadSchema.safeParse(parsed);
    if (!payload.success) {
      return json({ error: "invalid payload", issues: payload.error.issues }, 400);
    }

    const { status, projectLinked } = await deps.store().record(payload.data);
    // A repeat is acknowledged, so the sender stops, but never stored twice.
    return json({ status, target: payload.data.report.target, startedAt: payload.data.report.startedAt, projectLinked }, 200);
  };
}

/** In-memory store for tests. */
export class MemoryReportStore implements ReportStore {
  readonly reports: Array<{ projectId: string | null; report: AuditReport }> = [];

  /** registry id -> project id, standing in for the projects table. */
  constructor(private readonly projects: Record<string, string> = {}) {}

  async record({ registryId, report }: ReportPayload) {
    const projectId = registryId ? (this.projects[registryId] ?? null) : null;
    const exists = this.reports.some((r) => r.report.target === report.target && r.report.startedAt === report.startedAt);
    if (exists) return { status: "duplicate" as const, projectLinked: projectId !== null };
    this.reports.push({ projectId, report });
    return { status: "recorded" as const, projectLinked: projectId !== null };
  }
}
