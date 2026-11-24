import { getRegistry } from "@/lib/registry/cached";
import { createRunAnswersHandler } from "@/lib/run-reports/answers";
import { SupabaseRunAnswerStore } from "@/lib/run-reports/supabase-answers";

const handler = createRunAnswersHandler({
  secret: process.env.STEP_WEBHOOK_SECRET,
  repoOf: async () => new Map([...(await getRegistry()).values()].map((e) => [e.id, e.repo])),
  store: () => new SupabaseRunAnswerStore(),
});

export async function POST(request: Request) {
  return handler(request);
}
