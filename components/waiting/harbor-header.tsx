import { EtTime } from "@/components/sites/et-time";
import type { LatestRunReport } from "@/lib/data/run-reports";
import type { WaitingData, WaitingPull } from "@/lib/data/waiting";
import { currentVerdict, type PullVerdicts } from "@/lib/run-reports/reviews";

export interface ProjectStatus {
  project: string;
  /** Unanswered run decisions plus pull requests ready for your yes or your eyes. */
  needsYou: number;
}

/** A PR needs you when the review asks for your eyes, or it's ready and the review didn't send it back. */
function pullNeedsYou(pull: WaitingPull, verdicts: PullVerdicts) {
  const verdict = currentVerdict(verdicts, pull)?.verdict;
  if (verdict === "needs-david") return true;
  return pull.stage === "ready" && verdict !== "changes-needed";
}

/** Each project with a recent run or an agent pull request, and how many things in it wait on you. */
export function projectStatuses(data: WaitingData, reports: LatestRunReport[], verdicts: PullVerdicts = {}): ProjectStatus[] {
  const counts = new Map<string, number>();
  const add = (project: string, n: number) => counts.set(project, (counts.get(project) ?? 0) + n);
  for (const r of reports) add(r.report.registryId, r.report.decisions.filter((d) => !r.answers[d.number]).length);
  if (data.configured) for (const p of data.pulls) if (p.byAgent) add(p.project, pullNeedsYou(p, verdicts) ? 1 : 0);
  return [...counts.entries()].map(([project, needsYou]) => ({ project, needsYou })).sort((a, b) => a.project.localeCompare(b.project));
}

/** Everything waiting on you across the projects: the hub's one big number. */
export function waitingCount(data: WaitingData, reports: LatestRunReport[], verdicts: PullVerdicts = {}) {
  return projectStatuses(data, reports, verdicts).reduce((n, p) => n + p.needsYou, 0);
}

/**
 * Night Harbor's summary, inside the header's teal glow on Waiting on you: the count of things
 * waiting on you as one big number, and a small dark tile per project. Teal means it needs you.
 */
export function HarborSummary({
  now,
  data,
  reports,
  verdicts = {},
}: {
  now: string;
  data: WaitingData;
  reports: LatestRunReport[];
  verdicts?: PullVerdicts;
}) {
  const projects = projectStatuses(data, reports, verdicts);
  const waiting = projects.reduce((n, p) => n + p.needsYou, 0);
  return (
    <div className="mt-4">
      <div className="flex items-baseline justify-between gap-3 text-xs text-muted">
        <h1 className="order-last font-medium text-accent">Waiting on you</h1>
        <EtTime iso={now} />
      </div>
      <p className="mt-3">
        <span className="block text-[68px] leading-[0.9] font-bold tracking-[-0.04em] text-signal [text-shadow:0_0_28px_rgb(79_209_197/0.35)]">
          {waiting}
        </span>
        <span className="mt-1.5 block text-[15px]">waiting on you</span>
      </p>
      {projects.length > 0 && (
        <ul aria-label="Your projects" className="mt-4 grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2">
          {projects.map((p) => (
            <li key={p.project} className="rounded-[10px] border border-border bg-tile p-2 text-xs text-muted">
              <span className="block truncate text-[12.5px] font-medium text-foreground">{p.project}</span>
              {p.needsYou > 0 ? <span className="text-signal">Needs you · {p.needsYou}</span> : "Clear"}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
