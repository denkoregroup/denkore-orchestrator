import { z } from "zod";

export const PROMPT_MIN = 10;
export const PROMPT_MAX = 4000;
export const DEFAULT_MAX_RETRIES = 3;
export const MAX_RETRIES_LIMIT = 10;

export const promptFormSchema = z.object({
  projectId: z.uuid({ error: "Choose a project." }),
  prompt: z
    .string()
    .trim()
    .min(PROMPT_MIN, { error: `Describe the work in at least ${PROMPT_MIN} characters.` })
    .max(PROMPT_MAX, { error: "Keep it under 4,000 characters." }),
  maxTestRetries: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? DEFAULT_MAX_RETRIES : Number(v)),
    z
      .number({ error: "Use a whole number from 0 to 10." })
      .int({ error: "Use a whole number from 0 to 10." })
      .min(0, { error: "Use a whole number from 0 to 10." })
      .max(MAX_RETRIES_LIMIT, { error: "Use a whole number from 0 to 10." }),
  ),
});

export type PromptField = "projectId" | "prompt" | "maxTestRetries";

export interface PromptFormState {
  errors: Partial<Record<PromptField | "form", string>>;
  /** Echoed back so the form keeps what was typed. */
  values: { projectId: string; prompt: string; maxTestRetries: string };
}

export const EMPTY_PROMPT_FORM: PromptFormState = {
  errors: {},
  values: { projectId: "", prompt: "", maxTestRetries: String(DEFAULT_MAX_RETRIES) },
};

export const UNKNOWN_PROJECT_MESSAGE =
  "That project isn’t set up. Pick another one, or run pnpm registry:sync.";

function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/** Reads only the three known fields; anything else in the form is ignored. */
export function parsePromptForm(formData: FormData) {
  const values = {
    projectId: field(formData, "projectId"),
    prompt: field(formData, "prompt"),
    maxTestRetries: field(formData, "maxTestRetries"),
  };
  const parsed = promptFormSchema.safeParse(values);
  if (parsed.success) return { ok: true as const, data: parsed.data, values };

  const errors: PromptFormState["errors"] = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path[0] as PromptField;
    errors[key] ??= issue.message;
  }
  return { ok: false as const, state: { errors, values } satisfies PromptFormState };
}
