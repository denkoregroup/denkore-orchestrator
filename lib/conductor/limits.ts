/**
 * Every Conductor limit in one place.
 *
 * STARTING VALUES. They are guesses made before any real run exists. Revisit
 * them once real runs have produced cost and step-count data.
 */
export const LIMITS = {
  /** A run that has created more steps than this escalates. */
  maxStepsPerRun: 20,
  /** A run whose reported step costs add up to more than this escalates. */
  maxCostUsd: 15,
  /** advanceRun applies at most this many actions per call. */
  maxAdvanceLoops: 10,
  /** The tick route advances at most this many runs per call. */
  tickBatchSize: 25,
  /** Agent turn cap for every step. */
  maxTurns: 30,
  /** Agent wall-clock cap for every step. */
  stepTimeoutSeconds: 1800,
  /**
   * Extra wait after stepTimeoutSeconds before a step that never reported back
   * (runner crashed, workflow cancelled, webhook lost) is marked failed.
   */
  stepTimeoutGraceSeconds: 300,
} as const;
