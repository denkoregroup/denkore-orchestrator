"use client";

import { useActionState } from "react";
import { fixWithConductorAction } from "@/app/(app)/sites/[id]/actions";
import { FIX } from "@/lib/audit-fixes/copy";
import type { GroupButton } from "@/lib/audit-fixes/plan";

/** The Fix with Conductor button for one severity group, or the reason it is off. Never printed. */
export function FixControl({ reportId, severity, button }: { reportId: string; severity: "fail" | "warn" | "info"; button: NonNullable<GroupButton> }) {
  const [state, action, pending] = useActionState(fixWithConductorAction, { message: null });
  const reasonId = `fix-${severity}-reason`;
  const off = !button.enabled;

  return (
    <form action={action} className="space-y-1 print:hidden">
      <input type="hidden" name="reportId" value={reportId} />
      <input type="hidden" name="severity" value={severity} />
      <button
        type="submit"
        disabled={off || pending}
        aria-describedby={off ? reasonId : undefined}
        className="min-h-12 rounded-md border border-border px-4 text-sm font-medium disabled:opacity-60"
      >
        {pending ? FIX.pending : FIX.button}
      </button>
      {off && (
        <p id={reasonId} className="text-sm text-muted">
          {button.reason}
        </p>
      )}
      <p aria-live="polite" className="min-h-5 text-sm text-muted">
        {state.message}
      </p>
    </form>
  );
}
