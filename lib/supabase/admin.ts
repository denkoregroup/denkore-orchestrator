import "server-only";
import { createClient } from "@supabase/supabase-js";
import { supabaseSecretKey, supabaseUrl } from "./env";

/**
 * Client for machine callers (the step-complete webhook), authenticated with
 * a Supabase secret key (sb_secret_...). Server only. Secret keys act as the
 * service_role Postgres role, whose SQL grants deny any write to `approvals`.
 */
export function createServiceClient() {
  return createClient(supabaseUrl(), supabaseSecretKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
