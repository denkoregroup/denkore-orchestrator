import Link from "next/link";
import { PrintButton } from "@/components/site-check/print-button";
import { AreaIcon, StatusIcon } from "@/components/site-check/icons";
import { QrCode } from "@/components/site-check/qr-code";
import { formatEt, formatEtDate } from "@/lib/format";
import { siteName } from "@/lib/site-health/labels";
import { groupByPage } from "@/lib/site-health/pages";
import type { StoredReport } from "@/lib/site-health/queries";
import { BOOKING_URL, VIEW } from "@/lib/site-check/copy";
import { summarizeForProspect, type Light } from "@/lib/site-check/summarize";

const LIGHT_TEXT: Record<Light, string> = { red: "text-check-red", amber: "text-check-amber", green: "text-check-green" };

const EYEBROW = "font-eyebrow text-xs uppercase tracking-widest text-check-muted";
const CARD = "rounded-2xl bg-check-card p-5 print:break-inside-avoid print:border print:border-check-line print:p-3";
const SECTION_TITLE = "font-heading text-xl font-semibold print:text-lg";

/**
 * What a prospect sees: one report as a short story, for a phone across a table and, printed, one
 * Letter page. Every sentence comes from lib/site-check (the rules and copy.ts). Text from the audited
 * site only appears in the collapsed findings list, as plain text.
 */
export function SiteCheckView({ current, bookingUrl = BOOKING_URL }: { current: StoredReport; bookingUrl?: string }) {
  const { report } = current;
  const summary = summarizeForProspect(report);
  const { headline, supporting } = summary;

  const back = (
    <p className="print:hidden">
      <Link href="/sites" className="font-copy text-sm text-check-muted underline">
        ← {VIEW.back}
      </Link>
    </p>
  );
  const title = (
    <h1 className="font-heading text-[2.5rem] font-semibold leading-[1.05] tracking-tight print:text-4xl">
      {headline.before}
      <span className="font-extralight">{headline.light}</span>
      {headline.after}
    </h1>
  );

  if (!summary.reachable) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-5 py-8 print:max-w-none print:p-0">
        {back}
        {title}
        <p className="text-lg text-check-muted">{supporting}</p>
      </main>
    );
  }

  const host = new URL(report.target).host;
  const fixCount = summary.topFixes.length;

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-8 px-5 py-8 print:max-w-none print:gap-4 print:p-0">
      {back}

      <header className="space-y-4 print:space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <p className={EYEBROW}>
            {VIEW.eyebrow} · <time dateTime={current.startedAt}>{formatEtDate(current.startedAt)}</time>
          </p>
          <p className="rounded-full border border-check-line px-3 py-1 font-eyebrow text-xs text-check-muted print:hidden">{siteName(report.target)}</p>
        </div>
        {title}
        <p className="text-lg text-check-muted print:text-base">{supporting}</p>
      </header>

      <section aria-labelledby="glance-heading" className="space-y-3 print:space-y-2">
        <h2 id="glance-heading" className={EYEBROW}>
          {VIEW.atAGlance}
        </h2>
        <ul className="grid gap-3 print:grid-cols-2 print:gap-2">
          {summary.areas.map((area) => (
            <li key={area.id} className={CARD}>
              <div className="flex items-center gap-3 text-check-ink">
                <AreaIcon id={area.id} />
                <h3 className="font-heading text-lg font-semibold">{area.title}</h3>
              </div>
              <p className={`mt-3 flex items-center gap-2 font-semibold print:mt-1 ${LIGHT_TEXT[area.light]}`}>
                <StatusIcon light={area.light} />
                {area.status}
              </p>
              <p className="mt-1 text-check-muted print:text-sm">{area.why}</p>
            </li>
          ))}
        </ul>
      </section>

      {fixCount > 0 && (
        <>
          <section aria-labelledby="fixes-heading" className="space-y-3 print:space-y-2">
            <h2 id="fixes-heading" className={SECTION_TITLE}>
              {VIEW.fixesHeading(fixCount)}
            </h2>
            <ol className="space-y-4 print:space-y-2">
              {summary.topFixes.map((fix, index) => (
                <li key={fix.title} className="flex gap-4 print:break-inside-avoid">
                  <span className="font-eyebrow text-sm text-check-muted">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <h3 className="font-heading text-lg font-semibold">{fix.title}</h3>
                    <p className="text-check-muted print:text-sm">{fix.outcome}</p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="help-heading" className={`${CARD} space-y-3 print:space-y-1`}>
            <h2 id="help-heading" className={SECTION_TITLE}>
              {VIEW.helpHeading}
            </h2>
            <p className="text-check-muted print:text-sm">{VIEW.helpLine(fixCount)}</p>
            {bookingUrl !== "" && (
              <div className="flex items-center gap-5">
                <QrCode text={bookingUrl} label={VIEW.qrLabel} />
                <a
                  href={bookingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-11 items-center rounded-full bg-check-ink px-5 font-semibold text-check-bg print:hidden"
                >
                  {VIEW.bookCall}
                </a>
              </div>
            )}
          </section>
        </>
      )}

      {summary.totalFindings > 0 && (
        <details className="rounded-2xl bg-check-card print:hidden">
          <summary className="flex min-h-12 cursor-pointer items-center px-5 font-semibold">{VIEW.allFindings(summary.totalFindings)}</summary>
          <div className="space-y-4 px-5 pb-5 pt-2">
            {groupByPage(report.findings, host).map((group) => (
              <div key={group.url}>
                <h3 className="break-all font-eyebrow text-xs text-check-muted">{group.path}</h3>
                <ul className="mt-1 space-y-1 text-sm">
                  {group.findings.map((f) => (
                    <li key={f.id}>{f.message}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </details>
      )}

      <div className="print:hidden">
        <PrintButton label={VIEW.savePdf} />
      </div>

      <footer className="space-y-1 border-t border-check-line pt-4 font-eyebrow text-xs text-check-muted print:pt-2">
        <p>
          {VIEW.checked} <time dateTime={current.startedAt}>{formatEt(current.startedAt)}</time> · {current.pagesChecked === 1 ? VIEW.checkedHomepage : VIEW.checkedPages(current.pagesChecked)}
        </p>
        {summary.totalFindings > 0 && <p className="hidden print:block">{VIEW.findingsOnRequest(summary.totalFindings)}</p>}
        <p>{VIEW.signature}</p>
      </footer>
    </main>
  );
}
