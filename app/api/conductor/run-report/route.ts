import { getRegistry } from "@/lib/registry/cached";
import { createRunReportHandler } from "@/lib/run-reports/ingest";
import { SupabaseRunReportStore } from "@/lib/run-reports/supabase-store";

const handler = createRunReportHandler({
  secret: process.env.STEP_WEBHOOK_SECRET,
  repoOf: async () => new Map([...(await getRegistry()).values()].map((e) => [e.id, e.repo])),
  store: () => new SupabaseRunReportStore(),
});

export async function POST(request: Request) {
  return handler(request);
}
