import type { Metadata } from "next";
import { z } from "zod";
import { listEvents } from "@/lib/data/events";
import { listRuns } from "@/lib/data/runs";
import { formatUtc } from "@/lib/format";
import { AuditList } from "./audit-list";

export const metadata: Metadata = { title: "Audit · Denkore" };

function runOptionLabel(project: string, prompt: string, createdAt: string) {
  const snippet = prompt.length > 40 ? `${prompt.slice(0, 40)}…` : prompt;
  return `${project} · ${snippet} · ${formatUtc(createdAt)}`;
}

export default async function AuditPage(props: PageProps<"/audit">) {
  const { run } = await props.searchParams;
  const runId = typeof run === "string" && z.uuid().safeParse(run).success ? run : undefined;

  const [page, runs] = await Promise.all([listEvents({ runId }), listRuns()]);
  const knownRun = runs.some((r) => r.run.id === runId);

  return (
    <section className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-xl font-semibold">Audit</h1>
      <p className="text-muted">Everything that happened, newest first. Entries can’t be edited or removed.</p>

      <form method="get" className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1 space-y-1">
          <label htmlFor="run" className="block text-sm font-medium">
            Show events for
          </label>
          <select
            id="run"
            name="run"
            defaultValue={runId ?? ""}
            className="min-h-12 w-full rounded-md border border-border bg-background px-3"
          >
            <option value="">All runs</option>
            {runId && !knownRun && <option value={runId}>Selected run</option>}
            {runs.map(({ run: r, project }) => (
              <option key={r.id} value={r.id}>
                {runOptionLabel(project?.registry_id ?? "Unknown project", r.prompt, r.created_at)}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="min-h-12 rounded-md border border-border px-4 font-medium">
          Show
        </button>
      </form>

      {page.events.length === 0 ? (
        <p className="rounded-lg border border-border p-4 text-muted">
          {runId ? "Nothing has been recorded for this run yet." : "Nothing has been recorded yet."}
        </p>
      ) : (
        <AuditList
          key={runId ?? "all"}
          initialEvents={page.events}
          initialCursor={page.nextCursor}
          runId={runId}
        />
      )}
    </section>
  );
}
