"use server";

import { listEvents, type EventsPage } from "@/lib/data/events";

/** Next (older) page of events. listEvents checks the owner and validates the input. */
export async function loadMoreEvents(input: { runId?: string; before: number }): Promise<EventsPage> {
  return listEvents(input);
}
