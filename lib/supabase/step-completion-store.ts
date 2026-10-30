import "server-only";
import type { StepCompletePayload, StepCompletionStore } from "@/lib/webhooks/step-complete";
import { createServiceClient } from "./admin";

/** Calls the record_step_completion SQL function, which is atomic and idempotent on step_key. */
export class SupabaseStepCompletionStore implements StepCompletionStore {
  async record(payload: StepCompletePayload) {
    const { data, error } = await createServiceClient().rpc("record_step_completion", {
      p_run_id: payload.runId,
      p_step_key: payload.stepKey,
      p_step: payload.step,
      p_output: payload.output,
    });
    if (error) throw new Error(`record_step_completion failed: ${error.message}`);
    return data === true ? ("recorded" as const) : ("duplicate" as const);
  }
}
