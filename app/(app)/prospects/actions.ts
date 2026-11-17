"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createFetcher } from "@/lib/audits/fetcher";
import { runAudit } from "@/lib/audits/run";
import { requireOwner } from "@/lib/auth";
import { parseProspectAddress } from "@/lib/site-check/address";
import { QUICK_CHECK_TIMEOUT_MS, type CheckFormState } from "@/lib/site-check/check-form";
import { CHECK_FORM } from "@/lib/site-check/copy";
import { SupabaseReportStore } from "@/lib/site-health/supabase-ingest-store";
import { findReportId } from "@/lib/site-health/queries";

/** The code of an error (a network error's `code`, else its name), never its message: a message can carry the address. */
function errorCode(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error && typeof error.code === "string") return error.code;
  return error instanceof Error ? error.name : "unknown";
}

/**
 * Checks one website now: audits its homepage, stores the report with no registry id (so it is a
 * prospect), and opens its site check. The fetcher refuses private addresses and off-site redirects.
 */
export async function checkSiteAction(_previous: CheckFormState, formData: FormData): Promise<CheckFormState> {
  await requireOwner();

  const typed = formData.get("url");
  const value = typeof typed === "string" ? typed : "";
  const address = parseProspectAddress(value);
  if (!address.ok) return { error: CHECK_FORM.failed, value };

  let reportId: string;
  try {
    const report = await runAudit({ url: address.url, maxPages: 1, fetcher: createFetcher({ timeoutMs: QUICK_CHECK_TIMEOUT_MS }) });
    await new SupabaseReportStore().record({ report });
    reportId = await findReportId(report.target, report.startedAt);
  } catch (error) {
    console.error("quick site check failed:", errorCode(error));
    return { error: CHECK_FORM.failed, value };
  }

  revalidatePath("/prospects");
  // redirect throws, so it stays outside the try/catch.
  redirect(`/check/${reportId}`);
}
