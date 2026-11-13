import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteCheckView } from "@/components/site-check/site-check-view";
import { requireOwner } from "@/lib/auth";
import { getSiteReport } from "@/lib/site-health/queries";

export const metadata: Metadata = { title: "Site check · Denkore" };

/** The site check for one stored report (a registered site or a prospect). Owner only; there is no public address. */
export default async function SiteCheckPage(props: PageProps<"/check/[reportId]">) {
  await requireOwner();
  const { reportId } = await props.params;
  const result = await getSiteReport(reportId);
  if (!result) notFound();
  return <SiteCheckView current={result.current} />;
}
