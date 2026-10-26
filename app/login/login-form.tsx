"use client";

import { useActionState } from "react";
import { sendMagicLink, type LoginState } from "./actions";

const initial: LoginState = { message: null };

export function LoginForm() {
  const [state, action, pending] = useActionState(sendMagicLink, initial);
  return (
    <form action={action} className="space-y-3">
      <label className="block space-y-1">
        <span className="text-sm">Email</span>
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="min-h-12 w-full rounded-md border border-border bg-background px-3"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="min-h-12 w-full rounded-md bg-foreground font-medium text-background disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send sign-in link"}
      </button>
      {state.message && (
        <p role="status" className="text-sm text-muted">
          {state.message}
        </p>
      )}
    </form>
  );
}
