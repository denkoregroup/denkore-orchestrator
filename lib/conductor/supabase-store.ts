/**
 * The Conductor's Supabase store.
 *
 * DELIBERATE: this uses the secret-key client from lib/supabase/admin, which
 * acts as the service_role Postgres role. The Conductor is a machine caller:
 * it writes run state, steps, gates and events that the owner's role cannot.
 * It still cannot write approvals; only the owner can (see 002_rls.sql).
 *
 * Pages and server actions never import this file. They reach it only by
 * calling advanceRun (lib/conductor/advance.ts), usually inside after().
 */
import "server-only";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/admin";
import { RUN_STATES, TERMINAL_STATES, type GateKind, type RunState } from "@/lib/state-machine";
import { STEP_NAMES, type StepName } from "@/lib/step-runner/types";
import type { ConductorStore, InsertResult } from "./store";
import type { RunSnapshot } from "./types";

const numeric = z.union([z.number(), z.string().regex(/^-?\d+(\.\d+)?$/).transform(Number)]);

const runRow = z.object({
  id: z.uuid(),
  state: z.enum(RUN_STATES),
  updated_at: z.string(),
  test_failures: z.number().int(),
  max_test_retries: z.number().int(),
  prompt: z.string(),
  project_id: z.uuid(),
});

const stepRow = z.object({
  step: z.enum(STEP_NAMES),
  attempt: z.number().int(),
  step_key: z.string(),
  status: z.enum(["dispatched", "succeeded", "failed"]),
  commit_sha: z.string().nullable(),
  pr_url: z.string().nullable(),
  cost_usd: numeric.nullable(),
  dispatched_at: z.string(),
});

const gateRow = z.object({
  id: z.uuid(),
  kind: z.enum(["spec", "design", "release"]),
  commit_sha: z.string(),
  status: z.enum(["pending", "approved", "changes_requested"]),
});

const approvalRow = z.object({
  gate_id: z.uuid(),
  commit_sha: z.string(),
  decision: z.enum(["approve", "request_changes"]),
  approved_by: z.uuid(),
  note: z.string().nullable(),
  created_at: z.string(),
});

type Db = ReturnType<typeof createServiceClient>;

function fail(what: string, error: { message: string }): never {
  throw new Error(`conductor store: ${what} failed: ${error.message}`);
}

const UNIQUE_VIOLATION = "23505";

export class SupabaseConductorStore implements ConductorStore {
  private client: Db | null = null;

  /** Created on first use, so importing this module needs no secret. */
  private get db(): Db {
    this.client ??= createServiceClient();
    return this.client;
  }

  async loadSnapshot(runId: string): Promise<RunSnapshot | null> {
    if (!z.uuid().safeParse(runId).success) return null;
    const runRes = await this.db
      .from("runs")
      .select("id, state, updated_at, test_failures, max_test_retries, prompt, project_id")
      .eq("id", runId)
      .maybeSingle();
    if (runRes.error) fail("load run", runRes.error);
    if (!runRes.data) return null;
    const run = runRow.parse(runRes.data);

    const [projectRes, stepsRes, gatesRes] = await Promise.all([
      this.db.from("projects").select("registry_id").eq("id", run.project_id).maybeSingle(),
      this.db
        .from("steps")
        .select("step, attempt, step_key, status, commit_sha, pr_url, cost_usd, dispatched_at")
        .eq("run_id", runId)
        .order("dispatched_at"),
      this.db.from("gates").select("id, kind, commit_sha, status").eq("run_id", runId),
    ]);
    if (projectRes.error) fail("load project", projectRes.error);
    if (stepsRes.error) fail("load steps", stepsRes.error);
    if (gatesRes.error) fail("load gates", gatesRes.error);
    const steps = z.array(stepRow).parse(stepsRes.data ?? []);
    const gates = z.array(gateRow).parse(gatesRes.data ?? []);

    let approvals: z.infer<typeof approvalRow>[] = [];
    if (gates.length > 0) {
      const approvalsRes = await this.db
        .from("approvals")
        .select("gate_id, commit_sha, decision, approved_by, note, created_at")
        .in("gate_id", gates.map((g) => g.id))
        .order("created_at", { ascending: false });
      if (approvalsRes.error) fail("load approvals", approvalsRes.error);
      approvals = z.array(approvalRow).parse(approvalsRes.data ?? []);
    }

    return {
      runId,
      state: run.state,
      stateEnteredAt: run.updated_at,
      testFailures: run.test_failures,
      maxTestRetries: run.max_test_retries,
      prompt: run.prompt,
      registryId: projectRes.data ? z.object({ registry_id: z.string() }).parse(projectRes.data).registry_id : null,
      steps: steps.map((s) => ({
        step: s.step,
        attempt: s.attempt,
        stepKey: s.step_key,
        status: s.status,
        commitSha: s.commit_sha,
        prUrl: s.pr_url,
        costUsd: s.cost_usd,
        dispatchedAt: s.dispatched_at,
      })),
      gates: gates.map((g) => {
        const latest = approvals.find((a) => a.gate_id === g.id);
        return {
          id: g.id,
          kind: g.kind,
          commitSha: g.commit_sha,
          status: g.status,
          latestDecision: latest
            ? {
                decision: latest.decision,
                commitSha: latest.commit_sha,
                approvedBy: latest.approved_by,
                note: latest.note,
                createdAt: latest.created_at,
              }
            : null,
        };
      }),
      totalCostUsd: steps.reduce((sum, s) => sum + (s.cost_usd ?? 0), 0),
    };
  }

  async setState(
    runId: string,
    expected: { state: RunState; stateEnteredAt: string },
    next: { state: RunState; testFailures: number; stateEnteredAt: string },
  ): Promise<boolean> {
    const { data, error } = await this.db
      .from("runs")
      .update({ state: next.state, test_failures: next.testFailures, updated_at: next.stateEnteredAt })
      .eq("id", runId)
      .eq("state", expected.state)
      .eq("updated_at", expected.stateEnteredAt)
      .select("id");
    if (error) fail("set state", error);
    return (data?.length ?? 0) === 1;
  }

  async insertStep(row: { runId: string; step: StepName; attempt: number; stepKey: string; dispatchedAt: string }): Promise<InsertResult> {
    const { error } = await this.db.from("steps").insert({
      run_id: row.runId,
      step: row.step,
      attempt: row.attempt,
      step_key: row.stepKey,
      status: "dispatched",
      dispatched_at: row.dispatchedAt,
    });
    if (error?.code === UNIQUE_VIOLATION) return "conflict";
    if (error) fail("insert step", error);
    return "inserted";
  }

  async markStepFailed(stepKey: string): Promise<void> {
    const { error } = await this.db
      .from("steps")
      .update({ status: "failed" })
      .eq("step_key", stepKey)
      .eq("status", "dispatched");
    if (error) fail("mark step failed", error);
  }

  async openGate(runId: string, kind: GateKind, sha: string): Promise<InsertResult> {
    const { error } = await this.db.from("gates").insert({ run_id: runId, kind, commit_sha: sha });
    if (error?.code === UNIQUE_VIOLATION) return "conflict";
    if (error) fail("open gate", error);
    return "inserted";
  }

  async moveGate(gateId: string, fromSha: string, toSha: string): Promise<boolean> {
    const { data, error } = await this.db
      .from("gates")
      .update({ commit_sha: toSha })
      .eq("id", gateId)
      .eq("commit_sha", fromSha)
      .select("id");
    if (error) fail("move gate", error);
    return (data?.length ?? 0) === 1;
  }

  async logEvent(runId: string, kind: string, payload: Record<string, unknown>): Promise<void> {
    const { error } = await this.db.from("events").insert({ run_id: runId, kind, payload, actor: "conductor" });
    if (error) fail("log event", error);
  }

  async listActiveRunIds(limit: number): Promise<string[]> {
    const { data, error } = await this.db
      .from("runs")
      .select("id")
      .not("state", "in", `(${TERMINAL_STATES.join(",")})`)
      .order("created_at", { ascending: true })
      .limit(limit);
    if (error) fail("list active runs", error);
    return z.array(z.object({ id: z.uuid() })).parse(data ?? []).map((r) => r.id);
  }
}
