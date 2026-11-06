import { scheduleAdvance } from "@/lib/conductor/schedule";
import { SupabaseStepCompletionStore } from "@/lib/supabase/step-completion-store";
import { createStepCompleteHandler } from "@/lib/webhooks/step-complete";

const handler = createStepCompleteHandler({
  secret: process.env.STEP_WEBHOOK_SECRET,
  store: () => new SupabaseStepCompletionStore(),
  // Advance after the response, and only for new completions; replays change nothing.
  onRecorded: (payload) => scheduleAdvance(payload.runId),
});

export async function POST(request: Request) {
  return handler(request);
}
