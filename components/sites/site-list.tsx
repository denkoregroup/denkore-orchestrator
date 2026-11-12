import Link from "next/link";
import { EtTime } from "@/components/sites/et-time";
import { pagesLabel, SEVERITY_GROUPS, siteName } from "@/lib/site-health/labels";
import type { SiteSummary } from "@/lib/site-health/queries";

/** Works in Server and Client Components (no server-only imports at runtime). */
export function SiteList({ sites, truncated }: { sites: SiteSummary[]; truncated: boolean }) {
  if (sites.length === 0) {
    return (
      <p className="rounded-lg border border-border p-4 text-muted">
        No site reports yet. A site appears here once an audit of it has been sent to the app.
      </p>
    );
  }
  return (
    <>
      <ul className="space-y-3">
        {sites.map((site) => (
          <li key={site.id}>
            <Link
              href={`/sites/${site.id}`}
              className="block min-h-12 space-y-2 rounded-lg border border-border p-4 hover:border-foreground"
            >
              <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="break-all font-medium">{siteName(site.target)}</span>
                <span className="text-sm text-muted">
                  <EtTime iso={site.startedAt} /> · {pagesLabel(site.pagesChecked)}
                </span>
              </span>
              <dl className="grid grid-cols-3 gap-2 text-sm">
                {SEVERITY_GROUPS.map(({ severity, label }) => (
                  <div key={severity}>
                    <dt className="text-muted">{label}</dt>
                    <dd className={severity === "fail" && site.counts.fail > 0 ? "font-semibold text-accent" : "font-medium"}>
                      {site.counts[severity]}
                    </dd>
                  </div>
                ))}
              </dl>
            </Link>
          </li>
        ))}
      </ul>
      {truncated && (
        <p className="text-sm text-muted">Showing sites from the newest reports only. A site with no recent report may be missing.</p>
      )}
    </>
  );
}
