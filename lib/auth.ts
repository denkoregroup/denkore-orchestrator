import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { ownerUserId } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export interface Owner {
  id: string;
  email: string | null;
}

/**
 * Data Access Layer check: the proxy already redirects strangers, but every
 * server read of private data should call this too. Cached per request, so
 * several data calls in one render check the session once.
 */
export const requireOwner = cache(async (): Promise<Owner> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims || claims.sub !== ownerUserId()) redirect("/login");
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null };
});
