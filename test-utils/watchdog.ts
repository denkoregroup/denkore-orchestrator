import type { WatchdogResult } from "@/lib/site-health/watchdog";

/** A watchdog that finds nothing, for tests of the tick that are about runs. */
export const quietWatchdog = async (): Promise<WatchdogResult> => ({ sitesChecked: 0, overdue: [], escalated: [], unsynced: [] });
