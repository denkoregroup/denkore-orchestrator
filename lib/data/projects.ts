import "server-only";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseRows, PROJECT_COLUMNS, projectRow, queryError, type ProjectRow } from "./rows";

export async function listProjects(): Promise<ProjectRow[]> {
  await requireOwner();
  const db = await createClient();
  const { data, error } = await db.from("projects").select(PROJECT_COLUMNS).order("registry_id");
  if (error) throw queryError("listProjects", error);
  return parseRows(projectRow, data, "projects");
}
