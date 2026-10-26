import { z } from "zod";
import { registryEntrySchema } from "@/lib/registry/schema";

export const STEP_NAMES = ["spec", "design", "build_test", "verify", "deploy", "post_deploy_check"] as const;

export const stepName = z.enum(STEP_NAMES);
export type StepName = z.infer<typeof stepName>;

const sha = z.string().regex(/^[0-9a-f]{7,40}$/);

export const stepInputSchema = z.strictObject({
  runId: z.uuid(),
  step: stepName,
  registryEntry: registryEntrySchema,
  task: z.string().min(1),
  toolAllowlist: z.array(z.string().min(1)),
  model: z.string().min(1),
  maxTurns: z.number().int().positive(),
  timeoutSeconds: z.number().int().positive(),
  branch: z.string().min(1),
});

export type StepInput = z.infer<typeof stepInputSchema>;

/** What the agent produced. Either a commit or a PR link is required. */
export const stepOutputSchema = z
  .strictObject({
    status: z.enum(["succeeded", "failed"]),
    /** Step-specific structured result; validated per step by the caller. */
    result: z.record(z.string(), z.unknown()),
    commitSha: sha.optional(),
    prUrl: z.url({ protocol: /^https$/ }).optional(),
    costUsd: z.number().nonnegative(),
    sessionId: z.string().min(1),
  })
  .refine((o) => o.commitSha !== undefined || o.prUrl !== undefined, {
    message: "either commitSha or prUrl is required",
  });

export type StepOutput = z.infer<typeof stepOutputSchema>;

/** Returned when a step is handed to a runner; the output arrives later via the step-complete webhook. */
export interface StepDispatch {
  runId: string;
  step: StepName;
  /** Idempotency key the runner must echo back on completion. */
  stepKey: string;
}

export interface StepRunner {
  readonly name: string;
  dispatch(input: StepInput): Promise<StepDispatch>;
}

export function stepKeyFor(runId: string, step: StepName, attempt: number): string {
  return `${runId}:${step}:${attempt}`;
}
