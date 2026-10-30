"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createRun } from "@/lib/data/runs";
import { parsePromptForm, UNKNOWN_PROJECT_MESSAGE, type PromptFormState } from "@/lib/runs/prompt-form";

export async function createRunAction(
  _prev: PromptFormState,
  formData: FormData,
): Promise<PromptFormState> {
  const parsed = parsePromptForm(formData);
  if (!parsed.ok) return parsed.state;

  // createRun checks the owner and that the project exists (RLS scopes it to the owner).
  const result = await createRun(parsed.data);
  if (!result.ok) {
    return { errors: { projectId: UNKNOWN_PROJECT_MESSAGE }, values: parsed.values };
  }

  revalidatePath("/runs");
  // redirect throws, so it stays outside any try/catch.
  redirect(`/runs/${result.id}`);
}
