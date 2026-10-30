import "server-only";
import { z } from "zod";
import { requireOwner } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { EVENT_COLUMNS, eventRow, parseRows, queryError, type EventRow } from "./rows";

export const EVENTS_PAGE_SIZE = 50;

export interface EventsPage {
  events: EventRow[];
  /** Pass as `before` to get the next (older) page; null when there is none. */
  nextCursor: number | null;
}

export const listEventsInput = z.object({
  runId: z.uuid().optional(),
  before: z.number().int().positive().optional(),
});

/** Newest first, 50 per page, keyset-paginated on id. */
export async function listEvents(input: z.input<typeof listEventsInput> = {}): Promise<EventsPage> {
  await requireOwner();
  const { runId, before } = listEventsInput.parse(input);
  const db = await createClient();

  let query = db
    .from("events")
    .select(EVENT_COLUMNS)
    .order("id", { ascending: false })
    .limit(EVENTS_PAGE_SIZE + 1);
  if (runId) query = query.eq("run_id", runId);
  if (before) query = query.lt("id", before);

  const { data, error } = await query;
  if (error) throw queryError("listEvents", error);
  const rows = parseRows(eventRow, data, "events");

  const events = rows.slice(0, EVENTS_PAGE_SIZE);
  const nextCursor = rows.length > EVENTS_PAGE_SIZE ? events[events.length - 1].id : null;
  return { events, nextCursor };
}
