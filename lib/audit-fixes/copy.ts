/** The words around Fix with Conductor on a site report. Owner-facing; edit them here. */
export const FIX = {
  button: "Fix with Conductor",
  pending: "Starting…",
  needsYou: "Needs you",
  inProgress: "In progress",
  runLabel: (shortId: string): string => `run #${shortId}`,
  noRepo: "This site isn't one of your projects, so there is no repository to change.",
  notLatest: "This isn't the latest report for this site. Open the latest one to fix what is open now.",
  runOpen: (shortId: string): string => `A run is already open for this site (run #${shortId}). Wait for it to finish.`,
  nothing: "There is nothing in this group the Conductor can fix.",
  invalid: "That request wasn't valid. Reload the page and try again.",
  reportGone: "That report no longer exists.",
  started: (shortId: string): string => `Started run #${shortId}.`,
  failed: "The run couldn't be started. Try again.",
  verifiedBy: "Verified by report",
  notVerified: "Not verified yet. Only a later audit report can verify this run: it has to show the findings fixed.",
} as const;

/** The first eight characters of a run's id, which is how a run is named on the page. */
export function shortRunId(runId: string): string {
  return runId.slice(0, 8);
}
