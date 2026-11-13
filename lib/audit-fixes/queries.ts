import "server-only";
import { z } from "zod";
import { requireOwner } from "@/lib/auth";
import { queryError } from "@/lib/data/rows";
import { getRegistry } from "@/lib/registry/cached";
import { TERMINAL_STATES } from "@/lib/state-machine";
import { createClient } from "@/lib/supabase/server";
import type { FixContext } from "./plan";
import { AUDIT_FIX_MARKER, FIX_REQUESTED_EVENT } from "./prompt";

/**
 * What the page needs to know about the site behind a stored report: its project and repository, whether
 * this is its newest report, and its open fix run. Read with the owner's session, so row level security applies.
 */
export async function loadFixContext(reportId: string, target: string): Promise<FixContext> {
  await requireOwner();
  const db = await createClient();

  const report = await db.from("audit_reports").select("project_id").eq("id", reportId).maybeSingle();
  if (report.error) throw queryError("loadFixContext (report)", report.error);
  if (!report.data) throw new Error("loadFixContext: the report cannot be read");
  const { project_id: projectId } = z.object({ project_id: z.uuid().nullable() }).parse(report.data);
  if (projectId === null) return { projectId: null, repo: null, isLatest: false, openRun: null };

  const [project, newest, runs] = await Promise.all([
    db.from("projects").select("registry_id").eq("id", projectId).maybeSingle(),
    db.from("audit_reports").select("id").eq("target", target).order("started_at", { ascending: false }).limit(1),
    db
      .from("runs")
      .select("id")
      .eq("project_id", projectId)
      .like("prompt", `${AUDIT_FIX_MARKER}%`)
      .not("state", "in", `(${TERMINAL_STATES.join(",")})`)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);
  if (project.error) throw queryError("loadFixContext (project)", project.error);
  if (newest.error) throw queryError("loadFixContext (newest report)", newest.error);
  if (runs.error) throw queryError("loadFixContext (open run)", runs.error);

  const registryId = project.data ? z.object({ registry_id: z.string() }).parse(project.data).registry_id : null;
  const repo = registryId ? ((await getRegistry()).get(registryId)?.repo ?? null) : null;
  const isLatest = z.array(z.object({ id: z.uuid() })).parse(newest.data ?? [])[0]?.id === reportId;

  const [openRun] = z.array(z.object({ id: z.uuid() })).parse(runs.data ?? []);
  let findingIds: string[] = [];
  if (openRun) {
    const requested = await db.from("events").select("payload").eq("run_id", openRun.id).eq("kind", FIX_REQUESTED_EVENT).order("id").limit(1);
    if (requested.error) throw queryError("loadFixContext (fix request)", requested.error);
    const [event] = z.array(z.object({ payload: z.object({ finding_ids: z.array(z.string()).optional() }).loose() })).parse(requested.data ?? []);
    findingIds = event?.payload.finding_ids ?? [];
  }
  return { projectId, repo, isLatest, openRun: openRun ? { id: openRun.id, findingIds } : null };
}
