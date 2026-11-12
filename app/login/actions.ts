"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requestOrigin } from "@/lib/request-origin";
import { createClient } from "@/lib/supabase/server";

/**
 * Starts Sign in with GitHub (OAuth with PKCE, through Supabase Auth). GitHub sends the browser back
 * to wherever the button was pressed: localhost, a Vercel preview or production. Supabase accepts
 * that address only if it is on the Redirect URLs allowlist (see the README).
 */
export async function signInWithGitHub() {
  const origin = requestOrigin(await headers());

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: { redirectTo: `${origin}/auth/callback` },
  });
  if (error) throw new Error(`GitHub sign-in could not start: ${error.code ?? error.status}`);
  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
