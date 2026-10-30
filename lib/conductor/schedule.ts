import "server-only";
import { after } from "next/server";
import { advanceRun } from "./advance";

/**
 * Advances a run after the current response has been sent, so the owner's
 * request (or the webhook sender) never waits on the Conductor. Errors are
 * logged, not thrown: the tick route picks up anything that stalls.
 */
export function scheduleAdvance(runId: string): void {
  after(async () => {
    try {
      const result = await advanceRun(runId);
      if (result.stopped === "rejected") {
        console.warn(`conductor: run ${runId} event rejected: ${result.reason}`);
      }
    } catch (e) {
      console.error(`conductor: advancing run ${runId} failed`, e);
    }
  });
}
