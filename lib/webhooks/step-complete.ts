import { z } from "zod";
import { stepName, stepOutputSchema } from "@/lib/step-runner/types";
import { SIGNATURE_HEADER, verifySignature } from "./signature";

export const stepCompletePayloadSchema = z.strictObject({
  runId: z.uuid(),
  stepKey: z.string().min(1).max(200),
  step: stepName,
  output: stepOutputSchema,
});

export type StepCompletePayload = z.infer<typeof stepCompletePayloadSchema>;

export interface StepCompletionStore {
  /**
   * Atomically records the completion if `stepKey` is new.
   * Returns "duplicate" without side effects if it was already recorded.
   */
  record(payload: StepCompletePayload): Promise<"recorded" | "duplicate">;
}

/** In-memory store for tests and local development. */
export class MemoryStepCompletionStore implements StepCompletionStore {
  readonly records = new Map<string, StepCompletePayload>();

  async record(payload: StepCompletePayload) {
    if (this.records.has(payload.stepKey)) return "duplicate" as const;
    this.records.set(payload.stepKey, payload);
    return "recorded" as const;
  }
}

function json(body: unknown, status: number) {
  return Response.json(body, { status });
}

export function createStepCompleteHandler(deps: {
  secret: string | undefined;
  store: () => StepCompletionStore;
  /** Called only for a newly recorded completion, never for a replay. */
  onRecorded?: (payload: StepCompletePayload) => void;
}) {
  return async function handle(request: Request): Promise<Response> {
    if (!deps.secret) return json({ error: "webhook not configured" }, 500);

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
    const payload = stepCompletePayloadSchema.safeParse(parsed);
    if (!payload.success) {
      return json({ error: "invalid payload", issues: payload.error.issues }, 400);
    }

    const outcome = await deps.store().record(payload.data);
    if (outcome === "recorded") deps.onRecorded?.(payload.data);
    // Replays are acknowledged (so the sender stops retrying) but never re-applied.
    return json({ status: outcome, stepKey: payload.data.stepKey }, 200);
  };
}
