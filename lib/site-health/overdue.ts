/** A registered site whose newest report is older than this is overdue (GitHub may delay or skip a scheduled run). */
export const OVERDUE_AFTER_MS = 2 * 24 * 60 * 60 * 1000;

/**
 * Overdue means nothing has been reported for more than two days. A site that has never had a
 * report counts from the day it was registered, so a new site is not overdue before its first run.
 */
export function isOverdue(input: { lastReportAt: string | null; registeredAt: string }, now: Date): boolean {
  const since = new Date(input.lastReportAt ?? input.registeredAt).getTime();
  if (Number.isNaN(since)) throw new RangeError(`not a date: ${input.lastReportAt ?? input.registeredAt}`);
  return now.getTime() - since > OVERDUE_AFTER_MS;
}
