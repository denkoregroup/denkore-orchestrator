import { NextResponse, type NextRequest } from "next/server";
import { ownerUserId } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Where GitHub (through Supabase) sends the browser back: trades the one-time code for a session
 * cookie, and lets in only the owner. Anyone else is signed straight out again.
 *
 * Failures are logged by code only, never tokens, codes or emails. The page shows a plain message.
 */
export async function GET(request: NextRequest) {
  const to = (path: string) => NextResponse.redirect(new URL(path, request.url));
  const code = request.nextUrl.searchParams.get("code");

  if (!code) {
    // Also what a cancelled GitHub prompt looks like: an error query string and no code.
    console.error("sign-in callback: no code in the request");
    return to("/login?error=sign_in_failed");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error("sign-in callback: code exchange failed", error.code ?? error.status);
    return to("/login?error=sign_in_failed");
  }

  if (data.user.id !== ownerUserId()) {
    const signedOut = await supabase.auth.signOut();
    if (signedOut.error) console.error("sign-in callback: sign-out failed", signedOut.error.code ?? signedOut.error.status);
    console.error("sign-in callback: signed-in user is not the owner");
    return to("/login?error=not_allowed");
  }

  return to("/approvals");
}
