import "server-only";
import { redirect } from "next/navigation";
import { ownerUserId } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

export interface Owner {
  id: string;
  email: string | null;
}

/**
 * Data Access Layer check: the proxy already redirects strangers, but every
 * server read of private data should call this too. Must run inside <Suspense>.
 */
export async function requireOwner(): Promise<Owner> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims || claims.sub !== ownerUserId()) redirect("/login");
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null };
}
