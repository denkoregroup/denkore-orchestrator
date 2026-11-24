import { waitingCount } from "@/components/waiting/harbor-header";
import { getHubSummary } from "@/lib/data/hub";

/** Teal on the dark switch, abyssal on the light current segment. Nothing when nothing waits. */
export function CountBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span className="text-xs font-bold text-signal group-aria-[current=page]:text-abyss">
      {count}
      <span className="sr-only"> waiting</span>
    </span>
  );
}

/**
 * The count beside Waiting, on every page. If GitHub or the run reports can't be read it shows
 * nothing: Waiting on you itself says what failed.
 */
export async function WaitingCount() {
  const count = await getHubSummary().then(
    ({ data, reports, verdicts }) => waitingCount(data, reports, verdicts),
    () => 0,
  );
  return <CountBadge count={count} />;
}
