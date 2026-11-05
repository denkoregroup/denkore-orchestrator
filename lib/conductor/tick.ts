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
 * non-terminal runs, the longest-waiting (least recently changed) first. The body is ignored but must be signed.
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
    let advanced = 0;
    let stepsTimedOut = 0;
    // One at a time: runs are independent, and this keeps load on the database predictable.
    for (const runId of runIds) {
      try {
        const result = await deps.advance(runId);
        runs.push({ runId, stopped: result.stopped });
        if (result.applied.length > 0) advanced++;
        stepsTimedOut += result.applied.filter((a) => a.type === "fail_step").length;
      } catch (e) {
        console.error(`conductor tick: run ${runId} failed`, e);
        runs.push({ runId, stopped: "error" });
      }
    }
    // checked: runs looked at; advanced: runs that changed; stepsTimedOut: hung steps failed this tick.
    return json({ checked: runs.length, advanced, stepsTimedOut, runs }, 200);
  };
}
