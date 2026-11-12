import { formatEt } from "@/lib/format";

/** A timestamp in Eastern time, the same on the server, in the browser and in tests. */
export function EtTime({ iso }: { iso: string }) {
  return <time dateTime={iso}>{formatEt(iso)}</time>;
}
