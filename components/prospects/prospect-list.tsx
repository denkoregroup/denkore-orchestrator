import Link from "next/link";
import { EtTime } from "@/components/sites/et-time";
import { PROSPECTS } from "@/lib/site-check/copy";
import { summarizeForList, type ListSummary } from "@/lib/site-check/list";
import type { Light } from "@/lib/site-check/summarize";
import { siteName } from "@/lib/site-health/labels";
import type { StoredReport } from "@/lib/site-health/queries";

// Each dot is a light's colour and also a shape (a filled, ringed or hollow circle), and the row says
// the same in words, so a colour is never the only signal.
const DOT: Record<Light, string> = {
  red: "bg-red-500",
  amber: "bg-amber-500 ring-2 ring-inset ring-background",
  green: "border-2 border-green-600",
};

function Dots({ summary }: { summary: ListSummary }) {
  if (summary.dotsLabel === null) return null;
  return (
    <span role="img" aria-label={summary.dotsLabel} className="flex items-center gap-1.5">
      {summary.lights.map((light, index) => (
        <span key={index} aria-hidden="true" className={`size-3 rounded-full ${DOT[light]}`} />
      ))}
    </span>
  );
}

/** The newest check for each prospect, newest first. Each row opens that report's site check. */
export function ProspectList({ reports }: { reports: StoredReport[] }) {
  if (reports.length === 0) return <p className="rounded-lg border border-border p-4 text-muted">{PROSPECTS.empty}</p>;
  return (
    <ul className="space-y-3">
      {reports.map((stored) => {
        const summary = summarizeForList(stored.report);
        return (
          <li key={stored.id}>
            <Link href={`/check/${stored.id}`} className="block min-h-12 space-y-1 rounded-lg border border-border p-4 hover:border-foreground">
              <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="break-all font-medium">{siteName(stored.target)}</span>
                <span className="text-sm text-muted">
                  <EtTime iso={stored.startedAt} />
                </span>
              </span>
              <span className="flex items-center justify-between gap-3 text-sm">
                <span>{summary.status}</span>
                <Dots summary={summary} />
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
