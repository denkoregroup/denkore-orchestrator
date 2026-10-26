import Link from "next/link";
import { LocalTime } from "@/components/local-time";
import { actorLabel, eventDescription } from "@/lib/runs/labels";

export interface EventItem {
  id: number;
  run_id: string | null;
  kind: string;
  payload: unknown;
  actor: string;
  created_at: string;
}

/** Works in Server and Client Components (no server-only imports). */
export function EventList({ events, showRunLink = false }: { events: EventItem[]; showRunLink?: boolean }) {
  return (
    <ol className="divide-y divide-border rounded-lg border border-border">
      {events.map((event) => (
        <li key={event.id} className="space-y-1 p-3">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <p className="font-medium">{eventDescription(event.kind, event.payload)}</p>
            <p className="text-sm text-muted">
              <LocalTime iso={event.created_at} />
            </p>
          </div>
          <p className="text-sm text-muted">
            By {actorLabel(event.actor)}
            {showRunLink && event.run_id && (
              <>
                {" · "}
                <Link href={`/runs/${event.run_id}`} className="underline">
                  Open run
                </Link>
              </>
            )}
          </p>
          <details className="text-sm">
            <summary className="min-h-12 cursor-pointer content-center text-muted">
              Details <span className="sr-only">for this event</span>
              <span className="font-mono"> ({event.kind})</span>
            </summary>
            <pre className="overflow-x-auto rounded-md border border-border p-2 font-mono text-xs">
              {JSON.stringify(event.payload, null, 2)}
            </pre>
          </details>
        </li>
      ))}
    </ol>
  );
}
