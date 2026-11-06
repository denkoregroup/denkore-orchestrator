import { SIGNATURE_HEADER, verifySignature } from "@/lib/webhooks/signature";
import type { AdvanceResult } from "./advance";
import { LIMITS } from "./limits";

export interface TickDeps {
  /** Same shared secret and signature scheme as the step-complete webhook. */
  secret: string | undefined;
  listActiveRunIds: (limit: number) => Promise<string[]>;
  advance: (runId: string) => Promise<AdvanceResult>;
}

function json(body: unknown, status: number) {
  return Response.json(body, { status });
}

/**
 * The safety net for runs that stall: advances up to LIMITS.tickBatchSize
 * non-terminal runs, oldest first. The body is ignored but must be signed.
 * A replayed tick is harmless: advancing a run that has nothing to do is a no-op.
 */
export function createTickHandler(deps: TickDeps) {
  return async function handle(request: Request): Promise<Response> {
    if (!deps.secret) return json({ error: "tick not configured" }, 500);
    const rawBody = await request.text();
    if (!verifySignature(rawBody, request.headers.get(SIGNATURE_HEADER), deps.secret)) {
      return json({ error: "invalid signature" }, 401);
    }

    const runIds = await deps.listActiveRunIds(LIMITS.tickBatchSize);
    const runs: Array<{ runId: string; stopped: AdvanceResult["stopped"] | "error" }> = [];
    // One at a time: runs are independent, and this keeps load on the database predictable.
    for (const runId of runIds) {
      try {
        runs.push({ runId, stopped: (await deps.advance(runId)).stopped });
      } catch (e) {
        console.error(`conductor tick: run ${runId} failed`, e);
        runs.push({ runId, stopped: "error" });
      }
    }
    return json({ checked: runs.length, runs }, 200);
  };
}
