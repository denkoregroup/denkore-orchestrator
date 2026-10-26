import "server-only";
import { z } from "zod";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  EVENT_COLUMNS,
  eventRow,
  GATE_COLUMNS,
  gateRow,
  parseRow,
  parseRows,
  PROJECT_COLUMNS,
  projectRow,
  queryError,
  RUN_COLUMNS,
  runRow,
  STEP_COLUMNS,
  stepRow,
  type EventRow,
  type GateRow,
  type ProjectRow,
  type RunRow,
  type StepRow,
} from "./rows";

export const RUNS_LIMIT = 100;
const RUN_EVENTS_LIMIT = 200;

export interface RunSummary {
  run: RunRow;
  project: ProjectRow | null;
  costUsd: number;
}

export interface RunDetail {
  run: RunRow;
  project: ProjectRow | null;
  steps: StepRow[];
  gates: GateRow[];
  events: EventRow[];
  costUsd: number;
}

export function totalCost(steps: Array<{ cost_usd: number | null }>): number {
  return steps.reduce((sum, s) => sum + (s.cost_usd ?? 0), 0);
}

/** Newest first, with project and total step cost. */
export async function listRuns(): Promise<RunSummary[]> {
  await requireOwner();
  const db = await createClient();

  const { data, error } = await db
    .from("runs")
    .select(RUN_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(RUNS_LIMIT);
  if (error) throw queryError("listRuns", error);
  const runs = parseRows(runRow, data, "runs");
  if (runs.length === 0) return [];

  const runIds = runs.map((r) => r.id);
  const projectIds = [...new Set(runs.map((r) => r.project_id))];
  const [projectsRes, stepsRes] = await Promise.all([
    db.from("projects").select(PROJECT_COLUMNS).in("id", projectIds),
    db.from("steps").select("run_id, cost_usd").in("run_id", runIds),
  ]);
  if (projectsRes.error) throw queryError("listRuns projects", projectsRes.error);
  if (stepsRes.error) throw queryError("listRuns steps", stepsRes.error);

  const projects = new Map(parseRows(projectRow, projectsRes.data, "projects").map((p) => [p.id, p]));
  const costs = parseRows(stepRow.pick({ run_id: true, cost_usd: true }), stepsRes.data, "steps");

  return runs.map((run) => ({
    run,
    project: projects.get(run.project_id) ?? null,
    costUsd: totalCost(costs.filter((c) => c.run_id === run.id)),
  }));
}

/** A run with its steps, gates and events, or null if it does not exist (or is not the owner's). */
export async function getRun(id: string): Promise<RunDetail | null> {
  await requireOwner();
  if (!z.uuid().safeParse(id).success) return null;
  const db = await createClient();

  const runRes = await db.from("runs").select(RUN_COLUMNS).eq("id", id).maybeSingle();
  if (runRes.error) throw queryError("getRun", runRes.error);
  if (!runRes.data) return null;
  const run = parseRow(runRow, runRes.data, "runs");

  const [projectRes, stepsRes, gatesRes, eventsRes] = await Promise.all([
    db.from("projects").select(PROJECT_COLUMNS).eq("id", run.project_id).maybeSingle(),
    db.from("steps").select(STEP_COLUMNS).eq("run_id", id).order("dispatched_at"),
    db.from("gates").select(GATE_COLUMNS).eq("run_id", id).order("created_at"),
    db
      .from("events")
      .select(EVENT_COLUMNS)
      .eq("run_id", id)
      .order("id")
      .limit(RUN_EVENTS_LIMIT),
  ]);
  for (const [what, res] of [
    ["getRun project", projectRes],
    ["getRun steps", stepsRes],
    ["getRun gates", gatesRes],
    ["getRun events", eventsRes],
  ] as const) {
    if (res.error) throw queryError(what, res.error);
  }

  const steps = parseRows(stepRow, stepsRes.data, "steps");
  return {
    run,
    project: projectRes.data ? parseRow(projectRow, projectRes.data, "projects") : null,
    steps,
    gates: parseRows(gateRow, gatesRes.data, "gates"),
    events: parseRows(eventRow, eventsRes.data, "events"),
    costUsd: totalCost(steps),
  };
}

export type CreateRunResult = { ok: true; id: string } | { ok: false; reason: "unknown_project" };

/** Inserts only the columns the owner may write; the database fills the rest. */
export async function createRun(input: {
  projectId: string;
  prompt: string;
  maxTestRetries: number;
}): Promise<CreateRunResult> {
  await requireOwner();
  const db = await createClient();

  const projectRes = await db.from("projects").select("id").eq("id", input.projectId).maybeSingle();
  if (projectRes.error) throw queryError("createRun project", projectRes.error);
  if (!projectRes.data) return { ok: false, reason: "unknown_project" };

  const { data, error } = await db
    .from("runs")
    .insert({
      project_id: input.projectId,
      prompt: input.prompt,
      max_test_retries: input.maxTestRetries,
    })
    .select("id")
    .single();
  if (error) throw queryError("createRun", error);
  return { ok: true, id: parseRow(z.object({ id: z.uuid() }), data, "runs").id };
}
