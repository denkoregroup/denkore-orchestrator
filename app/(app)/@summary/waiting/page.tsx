import { HarborSummary } from "@/components/waiting/harbor-header";
import { getHubSummary } from "@/lib/data/hub";

/** On Waiting on you, the header's glow holds the big count and a tile per project. */
export default async function WaitingSummary() {
  const { data, reports } = await getHubSummary();
  return <HarborSummary now={new Date().toISOString()} data={data} reports={reports} />;
}
