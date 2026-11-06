import "server-only";
import { z } from "zod";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  GATE_STATUS_COLUMNS,
  gateStatusRow,
  parseRow,
  parseRows,
  PROJECT_COLUMNS,
  projectRow,
  queryError,
  RUN_COLUMNS,
  runRow,
  STEP_COLUMNS,
  stepRow,
  type GateStatusRow,
  type ProjectRow,
  type RunRow,
  type StepRow,
} from "./rows";

export interface PendingGate {
  gate: GateStatusRow;
  run: RunRow;
  project: ProjectRow | null;
  /** All steps of the run, newest first. */
  steps: StepRow[];
}

/** Gates waiting on the owner, from gate_approval_status, joined to runs, projects and steps. */
export async function listPendingGates(): Promise<PendingGate[]> {
  await requireOwner();
  const db = await createClient();

  const { data, error } = await db
    .from("gate_approval_status")
    .select(GATE_STATUS_COLUMNS)
    .eq("status", "pending");
  if (error) throw queryError("listPendingGates", error);
  const gates = parseRows(gateStatusRow, data, "gate_approval_status");
  if (gates.length === 0) return [];

  const runIds = [...new Set(gates.map((g) => g.run_id))];
  const [runsRes, stepsRes] = await Promise.all([
    db.from("runs").select(RUN_COLUMNS).in("id", runIds),
    db.from("steps").select(STEP_COLUMNS).in("run_id", runIds).order("dispatched_at", { ascending: false }),
  ]);
  if (runsRes.error) throw queryError("listPendingGates runs", runsRes.error);
  if (stepsRes.error) throw queryError("listPendingGates steps", stepsRes.error);
  const runs = new Map(parseRows(runRow, runsRes.data, "runs").map((r) => [r.id, r]));
  const steps = parseRows(stepRow, stepsRes.data, "steps");

  const projectIds = [...new Set([...runs.values()].map((r) => r.project_id))];
  const projectsRes = projectIds.length
    ? await db.from("projects").select(PROJECT_COLUMNS).in("id", projectIds)
    : { data: [], error: null };
  if (projectsRes.error) throw queryError("listPendingGates projects", projectsRes.error);
  const projects = new Map(parseRows(projectRow, projectsRes.data, "projects").map((p) => [p.id, p]));

  return gates
    .flatMap((gate) => {
      const run = runs.get(gate.run_id);
      if (!run) return [];
      return [
        {
          gate,
          run,
          project: projects.get(run.project_id) ?? null,
          steps: steps.filter((s) => s.run_id === run.id),
        },
      ];
    })
    .sort((a, b) => b.run.created_at.localeCompare(a.run.created_at));
}

export interface GateForDecision {
  gateId: string;
  runId: string;
  kind: GateStatusRow["kind"];
  /** Registry id of the run's project, or null if the project row is missing. */
  registryId: string | null;
}

/**
 * Looks up what a decision needs to know about a gate: its kind and project.
 * Deliberately does not return the gate's commit SHA; the approval must carry
 * the SHA the owner saw, so a gate that moved is rejected by the database.
 */
export async function getGateForDecision(gateId: string): Promise<GateForDecision | null> {
  await requireOwner();
  if (!z.uuid().safeParse(gateId).success) return null;
  const db = await createClient();

  const gateRes = await db.from("gates").select("id, run_id, kind").eq("id", gateId).maybeSingle();
  if (gateRes.error) throw queryError("getGateForDecision", gateRes.error);
  if (!gateRes.data) return null;
  const gate = parseRow(
    z.object({ id: z.uuid(), run_id: z.uuid(), kind: gateStatusRow.shape.kind }),
    gateRes.data,
    "gates",
  );

  const runRes = await db.from("runs").select("project_id").eq("id", gate.run_id).maybeSingle();
  if (runRes.error) throw queryError("getGateForDecision run", runRes.error);
  if (!runRes.data) return null;
  const { project_id } = parseRow(z.object({ project_id: z.uuid() }), runRes.data, "runs");

  const projectRes = await db.from("projects").select("registry_id").eq("id", project_id).maybeSingle();
  if (projectRes.error) throw queryError("getGateForDecision project", projectRes.error);
  const registryId = projectRes.data
    ? parseRow(z.object({ registry_id: z.string() }), projectRes.data, "projects").registry_id
    : null;

  return { gateId: gate.id, runId: gate.run_id, kind: gate.kind, registryId };
}

export interface ApprovalInsert {
  gateId: string;
  commitSha: string;
  decision: "approve" | "request_changes";
  note: string | null;
}

export type DbError = { code?: string; message: string };

/** Inserts an approval. Returns the database error, if any, for the caller to translate. */
export async function insertApproval(input: ApprovalInsert): Promise<{ error: DbError | null }> {
  await requireOwner();
  const db = await createClient();
  const { error } = await db.from("approvals").insert({
    gate_id: input.gateId,
    commit_sha: input.commitSha,
    decision: input.decision,
    note: input.note,
  });
  return { error: error ? { code: error.code, message: error.message } : null };
}
