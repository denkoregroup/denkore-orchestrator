"use client";

import { useActionState } from "react";
import {
  EMPTY_PROMPT_FORM,
  MAX_RETRIES_LIMIT,
  PROMPT_MAX,
  type PromptField,
} from "@/lib/runs/prompt-form";
import { createRunAction } from "./actions";

const inputClass = "min-h-12 w-full rounded-md border border-border bg-background px-3";

export function PromptForm({ projects }: { projects: Array<{ id: string; label: string }> }) {
  const [state, action, pending] = useActionState(createRunAction, EMPTY_PROMPT_FORM);

  const describedBy = (name: PromptField, hint?: string) =>
    [hint, state.errors[name] ? `${name}-error` : undefined].filter(Boolean).join(" ") || undefined;

  const error = (name: PromptField) => (
    <p id={`${name}-error`} className="min-h-5 text-sm text-accent">
      {state.errors[name]}
    </p>
  );

  return (
    <form action={action} className="space-y-4" noValidate>
      <div className="space-y-1">
        <label htmlFor="projectId" className="block text-sm font-medium">
          Project
        </label>
        <select
          id="projectId"
          name="projectId"
          required
          defaultValue={state.values.projectId || (projects.length === 1 ? projects[0].id : "")}
          aria-invalid={state.errors.projectId ? true : undefined}
          aria-describedby={describedBy("projectId")}
          className={inputClass}
        >
          <option value="" disabled>
            Choose a project
          </option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        {error("projectId")}
      </div>

      <div className="space-y-1">
        <label htmlFor="prompt" className="block text-sm font-medium">
          What should be built?
        </label>
        <p id="prompt-hint" className="text-sm text-muted">
          Describe the outcome you want, in your own words.
        </p>
        <textarea
          id="prompt"
          name="prompt"
          required
          rows={6}
          maxLength={PROMPT_MAX}
          defaultValue={state.values.prompt}
          aria-invalid={state.errors.prompt ? true : undefined}
          aria-describedby={describedBy("prompt", "prompt-hint")}
          className="w-full rounded-md border border-border bg-background p-3"
        />
        {error("prompt")}
      </div>

      <div className="space-y-1">
        <label htmlFor="maxTestRetries" className="block text-sm font-medium">
          Test retries before asking you (optional)
        </label>
        <p id="maxTestRetries-hint" className="text-sm text-muted">
          How many times to retry failing tests. 0 to {MAX_RETRIES_LIMIT}, default 3.
        </p>
        <input
          id="maxTestRetries"
          name="maxTestRetries"
          type="number"
          inputMode="numeric"
          min={0}
          max={MAX_RETRIES_LIMIT}
          step={1}
          defaultValue={state.values.maxTestRetries}
          aria-invalid={state.errors.maxTestRetries ? true : undefined}
          aria-describedby={describedBy("maxTestRetries", "maxTestRetries-hint")}
          className={`${inputClass} max-w-32`}
        />
        {error("maxTestRetries")}
      </div>

      <button
        type="submit"
        disabled={pending}
        className="min-h-12 w-full rounded-md bg-foreground font-medium text-background disabled:opacity-60 sm:w-auto sm:px-6"
      >
        {pending ? "Starting…" : "Start run"}
      </button>
      <p aria-live="polite" className="min-h-5 text-sm text-accent">
        {state.errors.form}
      </p>
    </form>
  );
}
