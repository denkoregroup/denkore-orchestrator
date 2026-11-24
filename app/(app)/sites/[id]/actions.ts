"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { FIX, shortRunId } from "@/lib/audit-fixes/copy";
import { findingsForRun, planFixes } from "@/lib/audit-fixes/plan";
import { buildFixPrompt } from "@/lib/audit-fixes/prompt";
import { loadFixContext } from "@/lib/audit-fixes/queries";
import { recordFixRequested } from "@/lib/audit-fixes/record";
import { requireOwner } from "@/lib/auth";
import { scheduleAdvance } from "@/lib/conductor/schedule";
import { createRun } from "@/lib/data/runs";
import { DEFAULT_MAX_RETRIES } from "@/lib/runs/prompt-form";
import { getSiteReport } from "@/lib/site-health/queries";

export interface FixFormState {
  message: string | null;
}

const input = z.object({ reportId: z.uuid(), severity: z.enum(["fail", "warn", "info"]) });

/**
 * One click on a severity group's button: one run for the site, holding the group's open, fixable
 * findings. It does nothing if the button would be off (no repository, an older report, a run already
 * open): the same plan the page drew is checked again here, because the page may be stale.
 */
export async function fixWithConductorAction(_previous: FixFormState, formData: FormData): Promise<FixFormState> {
  const owner = await requireOwner();

  const parsed = input.safeParse({ reportId: formData.get("reportId"), severity: formData.get("severity") });
  if (!parsed.success) return { message: FIX.invalid };
  const { reportId, severity } = parsed.data;

  const stored = await getSiteReport(reportId);
  if (!stored) return { message: FIX.reportGone };
  const { report } = stored.current;
  const context = await loadFixContext(reportId, report.target);

  const button = planFixes(report, context).groups[severity];
  if (button === null) return { message: FIX.nothing };
  if (!button.enabled) return { message: button.reason };
  // enabled means the site has a project and a repository, and a run can be made for it.
  const findings = findingsForRun(report, context, severity);

  const created = await createRun({
    projectId: context.projectId!,
    prompt: buildFixPrompt({ target: report.target, findings }),
    maxTestRetries: DEFAULT_MAX_RETRIES,
  });
  if (!created.ok) return { message: FIX.failed };

  await recordFixRequested({ runId: created.id, ownerId: owner.id, reportId, severity, findingIds: findings.map((f) => f.id) });
  scheduleAdvance(created.id);
  revalidatePath(`/sites/${reportId}`);
  revalidatePath("/runs");
  return { message: FIX.started(shortRunId(created.id)) };
}
