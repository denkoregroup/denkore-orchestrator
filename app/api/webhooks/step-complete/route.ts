import { SupabaseStepCompletionStore } from "@/lib/supabase/step-completion-store";
import { createStepCompleteHandler } from "@/lib/webhooks/step-complete";

const handler = createStepCompleteHandler({
  secret: process.env.STEP_WEBHOOK_SECRET,
  store: () => new SupabaseStepCompletionStore(),
});

export async function POST(request: Request) {
  return handler(request);
}
