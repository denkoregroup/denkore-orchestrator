import { advanceRun } from "@/lib/conductor/advance";
import { SupabaseConductorStore } from "@/lib/conductor/supabase-store";
import { createTickHandler } from "@/lib/conductor/tick";
import { getRegistry } from "@/lib/registry/cached";
import { SupabaseWatchdogStore } from "@/lib/site-health/supabase-watchdog-store";
import { runWatchdog } from "@/lib/site-health/watchdog";

// Up to 25 runs, each up to 10 actions; give it room.
export const maxDuration = 60;

const handler = createTickHandler({
  secret: process.env.STEP_WEBHOOK_SECRET,
  listActiveRunIds: (limit) => new SupabaseConductorStore().listActiveRunIds(limit),
  advance: (runId) => advanceRun(runId),
  watchdog: async () =>
    runWatchdog({
      // The registered sites: every registry entry with an audits block.
      registryIds: [...(await getRegistry()).values()].filter((e) => e.audits).map((e) => e.id),
      store: new SupabaseWatchdogStore(),
      now: new Date(),
    }),
});

export async function POST(request: Request) {
  return handler(request);
}
