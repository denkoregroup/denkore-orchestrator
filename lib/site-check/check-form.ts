/** What the quick-check form shows after a try that did not end in a redirect. */
export interface CheckFormState {
  error: string | null;
  /** Echoed back so the form keeps what was typed. */
  value: string;
}

export const EMPTY_CHECK_FORM: CheckFormState = { error: null, value: "" };

/** The quick check gives each request this long, so the whole check stays well inside the route's 60 seconds. */
export const QUICK_CHECK_TIMEOUT_MS = 8_000;
