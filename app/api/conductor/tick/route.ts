import { advanceRun } from "@/lib/conductor/advance";
import { SupabaseConductorStore } from "@/lib/conductor/supabase-store";
import { createTickHandler } from "@/lib/conductor/tick";

// Up to 25 runs, each up to 10 actions; give it room.
export const maxDuration = 60;

const handler = createTickHandler({
  secret: process.env.STEP_WEBHOOK_SECRET,
  listActiveRunIds: (limit) => new SupabaseConductorStore().listActiveRunIds(limit),
  advance: (runId) => advanceRun(runId),
});

export async function POST(request: Request) {
  return handler(request);
}
