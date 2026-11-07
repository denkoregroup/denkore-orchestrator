import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SiteReport } from "@/components/sites/site-report";
import { getSiteReport } from "@/lib/site-health/queries";

export const metadata: Metadata = { title: "Site · Denkore" };

export default async function SitePage(props: PageProps<"/sites/[id]">) {
  const { id } = await props.params;
  const result = await getSiteReport(id);
  if (!result) notFound();
  return <SiteReport current={result.current} previous={result.previous} />;
}
