import type { Finding } from "@/lib/audits/types";

/** First line of every run made from a site report. The Conductor reads it to take the fix route. */
export const AUDIT_FIX_MARKER = "[audit-fix]";

/** Written when the owner clicks Fix with Conductor. Its payload carries the ids of the findings. */
export const FIX_REQUESTED_EVENT = "audit.fix_requested";

/** Written when a later audit report shows the run's findings fixed. */
export const FIX_VERIFIED_EVENT = "audit.fix_verified";

export function isAuditFixPrompt(prompt: string): boolean {
  return prompt.startsWith(`${AUDIT_FIX_MARKER}\n`);
}

const MESSAGE_MAX = 300;

/** One plain line: control characters and line breaks become spaces, and it is cut at MESSAGE_MAX. */
function oneLine(text: string): string {
  return text
    .replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MESSAGE_MAX);
}

/** The address as the URL parser writes it, or null if it is not a plain http(s) address. */
function webAddress(raw: string): string | null {
  try {
    const url = new URL(raw);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * The run's prompt: for each finding, its check id, its page address and the auditor's own message, and
 * nothing else. A finding's evidence is never included, and the message is cut to one plain line. The
 * acceptance criterion is the next audit report showing every finding fixed.
 */
export function buildFixPrompt(input: { target: string; findings: Finding[] }): string {
  if (input.findings.length === 0) throw new Error("A fix run needs at least one finding");
  const host = new URL(input.target).host;
  const lines = input.findings.map((f) => {
    const address = webAddress(f.url);
    if (address === null) throw new Error(`Finding ${f.id} is about something that is not a web address`);
    return `- ${f.check} | ${address} | ${oneLine(f.message)}`;
  });
  return [
    AUDIT_FIX_MARKER,
    `Fix these audit findings on ${host}. Each line is the check, the page address and what the audit said.`,
    ...lines,
    "Acceptance: the next audit report shows every finding above as fixed. Change nothing else.",
  ].join("\n");
}
