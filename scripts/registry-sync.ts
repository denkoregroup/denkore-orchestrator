/**
 * pnpm registry:sync
 *
 * Upserts one `projects` row per registry/*.yaml entry, owned by
 * DENKORE_OWNER_USER_ID. Reads env from .env.local when present.
 * Uses the service-role key; this script is the only place that does.
 * Never prints key values.
 */
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { loadRegistry } from "../lib/registry/loader";
import { planRegistrySync } from "../lib/registry/sync";

const REQUIRED_ENV = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "DENKORE_OWNER_USER_ID",
] as const;

const projectRow = z.object({
  id: z.string(),
  registry_id: z.string(),
  repo: z.string(),
  owner_id: z.string(),
});

async function main() {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]);
  if (missing.length > 0) {
    console.error(`Missing environment variables: ${missing.join(", ")}`);
    console.error("Add them to .env.local (see .env.example) and run again.");
    process.exit(1);
  }
  const owner = z.uuid().safeParse(process.env.DENKORE_OWNER_USER_ID);
  if (!owner.success) {
    console.error("DENKORE_OWNER_USER_ID must be the owner's Supabase user UUID.");
    process.exit(1);
  }
  const ownerId = owner.data;

  const registry = await loadRegistry();
  console.log(`Registry: ${registry.size} entr${registry.size === 1 ? "y" : "ies"}`);

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data, error } = await supabase
    .from("projects")
    .select("id, registry_id, repo, owner_id")
    .in("registry_id", [...registry.keys()]);
  if (error) throw new Error(`Could not read projects: ${error.message}`);
  const existing = z.array(projectRow).parse(data ?? []);

  let failed = false;
  for (const action of planRegistrySync(registry.values(), existing, ownerId)) {
    switch (action.kind) {
      case "insert": {
        const { error: insertError } = await supabase
          .from("projects")
          .insert({ registry_id: action.registryId, repo: action.repo, owner_id: ownerId });
        if (insertError) {
          failed = true;
          console.error(`failed     ${action.registryId}: ${insertError.message}`);
        } else {
          console.log(`inserted   ${action.registryId} (${action.repo})`);
        }
        break;
      }
      case "update": {
        const { error: updateError } = await supabase
          .from("projects")
          .update({ repo: action.to })
          .eq("id", action.id);
        if (updateError) {
          failed = true;
          console.error(`failed     ${action.registryId}: ${updateError.message}`);
        } else {
          console.log(`changed    ${action.registryId}: repo ${action.from} -> ${action.to}`);
        }
        break;
      }
      case "unchanged":
        console.log(`unchanged  ${action.registryId}`);
        break;
      case "skipped":
        console.log(`skipped    ${action.registryId}: ${action.reason}`);
        break;
    }
  }
  if (failed) process.exit(1);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : "registry sync failed");
  process.exit(1);
});
