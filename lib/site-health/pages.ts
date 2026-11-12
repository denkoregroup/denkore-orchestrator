import { compareStrings, type Finding } from "@/lib/audits/types";

export interface PageRef {
  /** What to show for the address: its path under the site heading, with the host only when it is another one. */
  path: string;
  /** The full address, or null when it is not an http(s) address and so must not become a link. */
  href: string | null;
}

/**
 * The address comes from a posted report, so it is untrusted: it is shown as text, and made a link
 * only if it is a plain http(s) address (never `javascript:` and the like).
 */
export function pageRef(raw: string, host: string): PageRef {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { path: raw, href: null };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return { path: raw, href: null };
  const path = `${url.pathname}${url.search}`;
  return { path: url.host === host ? path : `${url.host}${path}`, href: url.href };
}

export interface PageGroup extends PageRef {
  url: string;
  findings: Finding[];
}

/** Findings grouped by the page they are about, pages in address order, each page's findings in their given order. */
export function groupByPage(findings: Finding[], host: string): PageGroup[] {
  const byUrl = new Map<string, Finding[]>();
  for (const f of findings) byUrl.set(f.url, [...(byUrl.get(f.url) ?? []), f]);
  return [...byUrl.keys()]
    .sort(compareStrings)
    .map((url) => ({ url, ...pageRef(url, host), findings: byUrl.get(url)! }));
}
