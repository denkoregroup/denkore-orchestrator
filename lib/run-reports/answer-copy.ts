/** What the answer form says. Shared by the action and the form; no server-only imports. */
export const MAX_ANSWER_LENGTH = 500;

export interface AnswerState {
  status: "idle" | "success" | "error";
  message: string | null;
}

export const INITIAL_ANSWER_STATE: AnswerState = { status: "idle", message: null };

export const ANSWER_MESSAGES = {
  invalid: "Write an answer of 500 characters or fewer, then send it.",
  stale: "A newer run has reported since this page loaded. Reload to see its questions.",
  duplicate: "This one is already answered. To change it, say so in the run's session.",
  sent: (project: string) => `Sent. The next ${project} run reads it before it starts work.`,
} as const;
