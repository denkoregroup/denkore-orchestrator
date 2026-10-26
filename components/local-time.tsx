"use client";

import { useSyncExternalStore } from "react";
import { formatUtc } from "@/lib/format";

const noopSubscribe = () => () => {};

/** Shows UTC from the server, then the viewer's local time after hydration. */
export function LocalTime({ iso }: { iso: string }) {
  const isClient = useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const date = new Date(iso);
  const text =
    isClient && !Number.isNaN(date.getTime())
      ? date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
      : formatUtc(iso);
  return <time dateTime={iso}>{text}</time>;
}
