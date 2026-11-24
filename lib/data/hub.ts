import "server-only";
import { cache } from "react";
import { getLatestRunReports } from "./run-reports";
import { getWaiting } from "./waiting";

/**
 * What the hub's header, its Waiting count and the Waiting on you page all read. Cached for the
 * request, so a page view reads GitHub and the run reports once.
 */
export const getHubSummary = cache(async () => {
  const [data, reports] = await Promise.all([getWaiting(), getLatestRunReports()]);
  return { data, reports };
});
