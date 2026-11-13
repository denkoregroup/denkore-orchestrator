import { isOverdue, OVERDUE_AFTER_MS } from "./overdue";

export const OVERDUE_EVENT_KIND = "audit.overdue";
/** The tick is the Conductor's, so the event is too. */
export const OVERDUE_EVENT_ACTOR = "conductor";

export interface WatchedSite {
  registryId: string;
  /** When the project row was created (registry:sync). */
  registeredAt: string;
  /** Start time of the site's newest stored report, or null if it has none. */
  lastReportAt: string | null;
}

export interface OverduePayload {
  registryId: string;
  lastReportAt: string | null;
  registeredAt: string;
  overdueAfterHours: number;
}

export interface WatchdogStore {
  /** The projects for these registry ids that exist, each with the time of its newest report. */
  watchedSites(registryIds: string[]): Promise<WatchedSite[]>;
  /** Writes the escalation event; "duplicate" if one with this key was already written. */
  escalate(event: { idempotencyKey: string; payload: OverduePayload }): Promise<"recorded" | "duplicate">;
}

export interface WatchdogResult {
  /** Registered sites looked at. */
  sitesChecked: number;
  /** Every site that is overdue now. */
  overdue: string[];
  /** The ones this run wrote a new escalation event for (the rest were already escalated). */
  escalated: string[];
  /** Registry entries with no project row yet, so there is nothing to compare: run pnpm registry:sync. */
  unsynced: string[];
}

/**
 * The missed-run watchdog. For each registered site (a registry entry with an audits block) it looks
 * at the newest report; if that is more than two days old it writes one escalation event per
 * overdue stretch (the key names the newest report, so a new report starts a new stretch), and
 * /sites marks the site Overdue. Without this, a scheduled run GitHub skipped would go unnoticed.
 */
export async function runWatchdog(input: { registryIds: string[]; store: WatchdogStore; now: Date }): Promise<WatchdogResult> {
  const { registryIds, store, now } = input;
  if (registryIds.length === 0) return { sitesChecked: 0, overdue: [], escalated: [], unsynced: [] };

  const sites = await store.watchedSites(registryIds);
  const found = new Set(sites.map((s) => s.registryId));
  const unsynced = registryIds.filter((id) => !found.has(id));
  if (unsynced.length > 0) console.error(`site watchdog: no project row for ${unsynced.join(", ")}; run pnpm registry:sync`);

  const overdue: string[] = [];
  const escalated: string[] = [];
  for (const site of sites) {
    if (!isOverdue(site, now)) continue;
    overdue.push(site.registryId);
    const stretch = site.lastReportAt ?? `registered:${site.registeredAt}`;
    const outcome = await store.escalate({
      idempotencyKey: `${OVERDUE_EVENT_KIND}:${site.registryId}:${stretch}`,
      payload: {
        registryId: site.registryId,
        lastReportAt: site.lastReportAt,
        registeredAt: site.registeredAt,
        overdueAfterHours: OVERDUE_AFTER_MS / 3_600_000,
      },
    });
    if (outcome === "recorded") escalated.push(site.registryId);
  }
  return { sitesChecked: sites.length, overdue, escalated, unsynced };
}
