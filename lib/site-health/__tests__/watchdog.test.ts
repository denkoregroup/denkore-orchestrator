import { OVERDUE_AFTER_MS, isOverdue } from "../overdue";
import { OVERDUE_EVENT_KIND, runWatchdog, type OverduePayload, type WatchdogStore, type WatchedSite } from "../watchdog";

const NOW = new Date("2026-11-12T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

describe("isOverdue", () => {
  const registeredAt = ago(30 * DAY);
  it("is overdue when the newest report is more than two days old, not at exactly two", () => {
    expect(isOverdue({ lastReportAt: ago(OVERDUE_AFTER_MS + 1), registeredAt }, NOW)).toBe(true);
    expect(isOverdue({ lastReportAt: ago(OVERDUE_AFTER_MS), registeredAt }, NOW)).toBe(false);
    expect(isOverdue({ lastReportAt: ago(DAY), registeredAt }, NOW)).toBe(false);
  });
  it("counts a site that never reported from the day it was registered", () => {
    expect(isOverdue({ lastReportAt: null, registeredAt: ago(3 * DAY) }, NOW)).toBe(true);
    expect(isOverdue({ lastReportAt: null, registeredAt: ago(DAY) }, NOW)).toBe(false);
  });
  it("accepts the timestamp format PostgREST writes", () => {
    expect(isOverdue({ lastReportAt: "2026-11-01T10:00:00+00:00", registeredAt }, NOW)).toBe(true);
  });
  it("throws on a value that is not a date, instead of calling the site fine", () => {
    expect(() => isOverdue({ lastReportAt: "garbage", registeredAt }, NOW)).toThrow(RangeError);
  });
});

/** A store that remembers its events by key, like the unique idempotency_key does. */
function fakeStore(sites: WatchedSite[]) {
  const written = new Map<string, OverduePayload>();
  const store: WatchdogStore = {
    watchedSites: jest.fn(async (ids: string[]) => sites.filter((s) => ids.includes(s.registryId))),
    escalate: jest.fn(async ({ idempotencyKey, payload }) => {
      if (written.has(idempotencyKey)) return "duplicate" as const;
      written.set(idempotencyKey, payload);
      return "recorded" as const;
    }),
  };
  return { store, written };
}

const site = (registryId: string, lastReportAt: string | null, registeredAt = ago(30 * DAY)): WatchedSite => ({ registryId, registeredAt, lastReportAt });

describe("runWatchdog", () => {
  it("escalates a site whose newest report is older than two days, and only that site", async () => {
    const { store, written } = fakeStore([site("fresh", ago(HOUR)), site("stale", ago(3 * DAY)), site("never", null)]);
    const result = await runWatchdog({ registryIds: ["fresh", "stale", "never"], store, now: NOW });

    expect(result).toEqual({ sitesChecked: 3, overdue: ["stale", "never"], escalated: ["stale", "never"], unsynced: [] });
    expect([...written.values()].map((p) => p.registryId)).toEqual(["stale", "never"]);
    expect(written.get(`${OVERDUE_EVENT_KIND}:stale:${ago(3 * DAY)}`)).toMatchObject({
      registryId: "stale",
      lastReportAt: ago(3 * DAY),
      overdueAfterHours: 48,
    });
  });

  it("writes nothing when every site reported recently", async () => {
    const { store, written } = fakeStore([site("a", ago(HOUR)), site("b", ago(2 * DAY - HOUR))]);
    const result = await runWatchdog({ registryIds: ["a", "b"], store, now: NOW });
    expect(result).toMatchObject({ overdue: [], escalated: [] });
    expect(written.size).toBe(0);
    expect(store.escalate).not.toHaveBeenCalled();
  });

  it("escalates once per overdue stretch: the tick runs every 5 minutes and must not repeat itself", async () => {
    const { store, written } = fakeStore([site("stale", ago(3 * DAY))]);
    const first = await runWatchdog({ registryIds: ["stale"], store, now: NOW });
    const later = await runWatchdog({ registryIds: ["stale"], store, now: new Date(NOW.getTime() + 5 * 60_000) });
    expect(first.escalated).toEqual(["stale"]);
    expect(later).toMatchObject({ overdue: ["stale"], escalated: [] }); // still overdue, already escalated
    expect(written.size).toBe(1);
  });

  it("starts a new stretch, and a new event, once the site has reported and gone quiet again", async () => {
    const { store, written } = fakeStore([]);
    const runWith = (lastReportAt: string) =>
      runWatchdog({ registryIds: ["s"], store: { ...store, watchedSites: async () => [site("s", lastReportAt)] }, now: NOW });
    await runWith(ago(3 * DAY));
    await runWith(ago(2.5 * DAY)); // a newer report that has itself gone stale
    expect(written.size).toBe(2);
  });

  it("names a site with no project row, and says how to fix it, instead of staying silent about it", async () => {
    const error = jest.spyOn(console, "error").mockImplementation(() => {});
    const { store } = fakeStore([site("known", ago(HOUR))]);
    const result = await runWatchdog({ registryIds: ["known", "not-synced"], store, now: NOW });
    expect(result).toMatchObject({ sitesChecked: 1, unsynced: ["not-synced"] });
    expect(error).toHaveBeenCalledWith("site watchdog: no project row for not-synced; run pnpm registry:sync");
    error.mockRestore();
  });

  it("does nothing, and asks the store nothing, when no site is registered for auditing", async () => {
    const { store } = fakeStore([]);
    expect(await runWatchdog({ registryIds: [], store, now: NOW })).toEqual({ sitesChecked: 0, overdue: [], escalated: [], unsynced: [] });
    expect(store.watchedSites).not.toHaveBeenCalled();
  });

  it("lets a store failure through, so the tick fails loudly", async () => {
    const store: WatchdogStore = { watchedSites: async () => { throw new Error("database down"); }, escalate: jest.fn() };
    await expect(runWatchdog({ registryIds: ["a"], store, now: NOW })).rejects.toThrow("database down");
  });
});
