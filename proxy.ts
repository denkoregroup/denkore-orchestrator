import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Skip static assets and the machine-to-machine routes (the step-complete
    // webhook, the Conductor tick and audit report ingest), which authenticate
    // by HMAC instead.
    "/((?!_next/static|_next/image|favicon.ico|api/webhooks|api/conductor|api/audits|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
