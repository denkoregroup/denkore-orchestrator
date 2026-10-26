function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

export const supabaseUrl = () => required("NEXT_PUBLIC_SUPABASE_URL");
export const supabasePublishableKey = () => required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
export const supabaseServiceRoleKey = () => required("SUPABASE_SERVICE_ROLE_KEY");
/** The single user allowed into the control plane. */
export const ownerUserId = () => required("DENKORE_OWNER_USER_ID");
