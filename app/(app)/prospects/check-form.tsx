"use client";

import { useActionState } from "react";
import { EMPTY_CHECK_FORM } from "@/lib/site-check/check-form";
import { CHECK_FORM } from "@/lib/site-check/copy";
import { checkSiteAction } from "./actions";

/** Their website, a Check site button, and what it costs in time. The button is off while the check runs. */
export function CheckForm() {
  const [state, action, pending] = useActionState(checkSiteAction, EMPTY_CHECK_FORM);

  return (
    <form action={action} className="space-y-2" noValidate>
      <label htmlFor="url" className="block text-sm font-medium">
        {CHECK_FORM.label}
      </label>
      <input
        id="url"
        name="url"
        type="text"
        inputMode="url"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        required
        defaultValue={state.value}
        placeholder={CHECK_FORM.placeholder}
        aria-invalid={state.error ? true : undefined}
        aria-describedby={state.error ? "url-hint url-error" : "url-hint"}
        className="min-h-12 w-full rounded-md border border-border bg-background px-3"
      />
      <p id="url-hint" className="text-sm text-muted">
        {CHECK_FORM.hint}
      </p>
      <button
        type="submit"
        disabled={pending}
        className="min-h-12 w-full rounded-md bg-foreground font-medium text-background disabled:opacity-60 sm:w-auto sm:px-6"
      >
        {pending ? CHECK_FORM.pending : CHECK_FORM.button}
      </button>
      <p id="url-error" role="alert" className="min-h-5 text-sm text-accent">
        {state.error}
      </p>
    </form>
  );
}
