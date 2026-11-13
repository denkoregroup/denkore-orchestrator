const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

export function formatUsd(amount: number): string {
  return usd.format(amount);
}

/** Deterministic UTC rendering, used on the server and as the pre-hydration fallback. */
export function formatUtc(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return `${date.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

// One shared formatter for every timestamp on the site pages. The zone is explicit, so the string
// is the same on localhost, on Vercel and in a test, whatever TZ the machine has.
const EASTERN = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "shortGeneric",
});

/** "Nov 8, 2026, 5:00 AM ET" (Eastern time, daylight saving included; the abbreviation is always ET). Throws on a bad date. */
export function formatEt(iso: string): string {
  return EASTERN.format(new Date(iso));
}

const EASTERN_DATE = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "short", day: "numeric" });

/** "Nov 8, 2026" (the date in Eastern time). Throws on a bad date. */
export function formatEtDate(iso: string): string {
  return EASTERN_DATE.format(new Date(iso));
}
