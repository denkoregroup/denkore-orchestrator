"use client";

import { createContext, use, useActionState, type ReactNode } from "react";
import { INITIAL_DECISION_STATE, type DecisionState } from "@/lib/approvals/decide";

type DecisionAction = (prev: DecisionState, formData: FormData) => Promise<DecisionState>;

interface DecisionContextValue {
  state: DecisionState;
  formAction: (formData: FormData) => void;
  pending: boolean;
}

const DecisionContext = createContext<DecisionContextValue | null>(null);

export function useDecision(): DecisionContextValue {
  const value = use(DecisionContext);
  if (!value) throw new Error("useDecision must be used inside <ApprovalsBoard>");
  return value;
}

/**
 * Holds the decision state above the cards. A decided gate leaves the list
 * when the page revalidates, so the confirmation has to live here, not in the card.
 */
export function ApprovalsBoard({ action, children }: { action: DecisionAction; children: ReactNode }) {
  const [state, formAction, pending] = useActionState(action, INITIAL_DECISION_STATE);
  return (
    <DecisionContext value={{ state, formAction, pending }}>
      <p role="status" aria-live="polite" className="min-h-12 content-center font-medium">
        {state.status === "success" ? state.message : ""}
      </p>
      {children}
    </DecisionContext>
  );
}
