import { createReportHandler } from "@/lib/site-health/ingest";
import { SupabaseReportStore } from "@/lib/site-health/supabase-ingest-store";

const handler = createReportHandler({
  secret: process.env.STEP_WEBHOOK_SECRET,
  store: () => new SupabaseReportStore(),
});

export async function POST(request: Request) {
  return handler(request);
}
