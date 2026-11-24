import { EtTime } from "@/components/sites/et-time";
import type { WaitingData, WaitingPull } from "@/lib/data/waiting";
import type { ChecksState } from "@/lib/github/pulls";
import { currentVerdict, type PullVerdict, type PullVerdicts } from "@/lib/run-reports/reviews";

const CHECKS_LABEL: Record<ChecksState, string> = {
  passing: "Checks passing",
  failing: "Checks failing",
  running: "Checks running",
  none: "No checks ran",
};

/** PRs with a Conductor review verdict for their current commit, most attention first. */
const VERDICT_SECTIONS = [
  {
    verdict: "needs-david",
    id: "waiting-look-closer",
    title: "Look closer",
    hint: "The review wants your eyes on these before you merge.",
  },
  {
    verdict: "changes-needed",
    id: "waiting-blocked",
    title: "Blocked",
    hint: "The review sent these back. The next run on that project picks them up.",
  },
] as const;

/** PRs no review has seen at their current commit, by what they wait on. */
const SECTIONS = [
  {
    stage: "ready",
    title: "Ready for your yes",
    hint: "Checks are green and nothing conflicts. Not reviewed yet at this commit.",
  },
  { stage: "needs_fix", title: "Needs a fix first", hint: "A check failed or the branch conflicts with main." },
  { stage: "checks_running", title: "Checks still running", hint: "Look again in a few minutes." },
] as const;

function PullCard({ pull, verdict }: { pull: WaitingPull; verdict?: PullVerdict }) {
  return (
    <li className="surface-card space-y-2 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-sm text-muted">
        <span className="font-medium text-foreground">{pull.project}</span>
        <span>
          Updated <EtTime iso={pull.updatedAt} />
        </span>
      </div>
      <a
        href={pull.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block min-h-12 break-words font-medium text-accent hover:underline"
      >
        #{pull.number} {pull.title}
      </a>
      {verdict?.reason && (
        <p className="break-words">
          <span className="font-semibold">{verdict.verdict === "needs-david" ? "Look at: " : "Needs: "}</span>
          {verdict.reason}
        </p>
      )}
      {pull.summary ? (
        <p className="break-words">{pull.summary}</p>
      ) : (
        pull.byAgent && <p className="text-sm text-muted">No summary in this pull request yet.</p>
      )}
      <ul className="flex flex-wrap gap-2 text-xs" aria-label="Status">
        <li className={`rounded border px-1.5 py-0.5 ${pull.checks === "failing" ? "border-accent font-semibold text-accent" : "border-border"}`}>
          {CHECKS_LABEL[pull.checks]}
        </li>
        {pull.conflicts === true && (
          <li className="rounded border border-accent px-1.5 py-0.5 font-semibold text-accent">Conflicts with main</li>
        )}
        {pull.draft && <li className="rounded border border-border px-1.5 py-0.5">Draft</li>}
        <li className="rounded border border-border px-1.5 py-0.5">{pull.byAgent ? "By Claude" : `By ${pull.author}`}</li>
      </ul>
    </li>
  );
}

/** Works in Server and Client Components (no server-only imports at runtime). */
/**
 * A review verdict counts only while the PR's head is the commit reviewed, and "ready" only while
 * GitHub agrees (checks green, no conflicts); otherwise the PR shows by its GitHub state.
 */
function sortByVerdict(pulls: WaitingPull[], verdicts: PullVerdicts) {
  const reviewed = new Map<WaitingPull, PullVerdict>();
  const unreviewed: WaitingPull[] = [];
  for (const pull of pulls) {
    const verdict = currentVerdict(verdicts, pull);
    if (verdict && (verdict.verdict !== "ready" || pull.stage === "ready")) reviewed.set(pull, verdict);
    else unreviewed.push(pull);
  }
  const withVerdict = (v: PullVerdict["verdict"]) => [...reviewed].filter(([, r]) => r.verdict === v);
  return { withVerdict, unreviewed };
}

export function WaitingBoard({ data, verdicts = {} }: { data: WaitingData; verdicts?: PullVerdicts }) {
  if (!data.configured) {
    return (
      <p className="rounded-lg border border-border p-4 text-muted">
        GitHub isn&apos;t connected yet. Add a read-only token as <code>GITHUB_READ_TOKEN</code> in Vercel to see your open
        pull requests here.
      </p>
    );
  }

  const agentPulls = data.pulls.filter((p) => p.byAgent);
  const otherPulls = data.pulls.filter((p) => !p.byAgent);
  const { withVerdict, unreviewed } = sortByVerdict(agentPulls, verdicts);
  const readyToMerge = withVerdict("ready");

  return (
    <div className="space-y-6">
      {data.unreadable.map((u) => (
        <p key={u.repo} role="alert" className="rounded-lg border border-accent p-3 text-sm">
          Couldn&apos;t read {u.project} ({u.repo}): {u.error}.
        </p>
      ))}
      {data.notShared.length > 0 && (
        <p className="text-sm text-muted">
          Not shown, because the GitHub token doesn&apos;t include their repos:{" "}
          {data.notShared.map((n) => n.project).join(", ")}.
        </p>
      )}
      {agentPulls.length === 0 && (
        <p className="rounded-lg border border-border p-4 text-muted">
          No pull request is waiting on you across your {data.projectCount} projects.
        </p>
      )}
      {VERDICT_SECTIONS.map(({ verdict, id, title, hint }) => {
        const pulls = withVerdict(verdict);
        if (pulls.length === 0) return null;
        return (
          <section key={verdict} aria-labelledby={id} className="space-y-2">
            <h2 id={id} className="font-semibold">
              {title} ({pulls.length})
            </h2>
            <p className="text-sm text-muted">{hint}</p>
            <ul className="space-y-3">
              {pulls.map(([p, v]) => (
                <PullCard key={`${p.repo}#${p.number}`} pull={p} verdict={v} />
              ))}
            </ul>
          </section>
        );
      })}
      {readyToMerge.length > 0 && (
        <section aria-labelledby="waiting-ready-to-merge" className="surface-card p-4">
          <h2 id="waiting-ready-to-merge" className="font-semibold">
            Ready to merge ({readyToMerge.length})
          </h2>
          <p className="break-words text-sm">
            {readyToMerge.map(([p], i) => (
              <span key={`${p.repo}#${p.number}`}>
                {i > 0 && <span className="text-muted"> · </span>}
                <a href={p.url} target="_blank" rel="noopener noreferrer" className="inline-block py-2 font-medium text-accent hover:underline">
                  {p.project} #{p.number}
                </a>
              </span>
            ))}
          </p>
        </section>
      )}
      {SECTIONS.map(({ stage, title, hint }) => {
        const pulls = unreviewed.filter((p) => p.stage === stage);
        if (pulls.length === 0) return null;
        return (
          <section key={stage} aria-labelledby={`waiting-${stage}`} className="space-y-2">
            <h2 id={`waiting-${stage}`} className="font-semibold">
              {title} ({pulls.length})
            </h2>
            <p className="text-sm text-muted">{hint}</p>
            <ul className="space-y-3">
              {pulls.map((p) => (
                <PullCard key={`${p.repo}#${p.number}`} pull={p} />
              ))}
            </ul>
          </section>
        );
      })}
      {otherPulls.length > 0 && (
        <section aria-labelledby="waiting-others" className="space-y-2">
          <h2 id="waiting-others" className="font-semibold">
            Other people&apos;s pull requests ({otherPulls.length})
          </h2>
          <p className="text-sm text-muted">Opened outside an agent session. Shown so nothing is missed.</p>
          <ul className="space-y-3">
            {otherPulls.map((p) => (
              <PullCard key={`${p.repo}#${p.number}`} pull={p} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
