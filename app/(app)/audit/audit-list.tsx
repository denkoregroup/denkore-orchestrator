"use client";

import { useState, useTransition } from "react";
import { EventList, type EventItem } from "@/components/event-list";
import { loadMoreEvents } from "./actions";

export function AuditList({
  initialEvents,
  initialCursor,
  runId,
}: {
  initialEvents: EventItem[];
  initialCursor: number | null;
  runId?: string;
}) {
  const [events, setEvents] = useState(initialEvents);
  const [cursor, setCursor] = useState(initialCursor);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function loadMore() {
    if (cursor === null) return;
    startTransition(async () => {
      try {
        const page = await loadMoreEvents({ runId, before: cursor });
        setEvents((current) => [...current, ...page.events]);
        setCursor(page.nextCursor);
        setMessage(`Loaded ${page.events.length} more.`);
      } catch {
        setMessage("Couldn’t load more. Try again.");
      }
    });
  }

  return (
    <div className="space-y-3">
      <EventList events={events} showRunLink={!runId} />
      {cursor !== null && (
        <button
          type="button"
          onClick={loadMore}
          disabled={pending}
          className="min-h-12 w-full rounded-md border border-border font-medium disabled:opacity-60"
        >
          {pending ? "Loading…" : "Load more"}
        </button>
      )}
      <p aria-live="polite" className="min-h-6 text-sm text-muted">
        {message}
      </p>
    </div>
  );
}
