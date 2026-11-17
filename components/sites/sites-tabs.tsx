import Link from "next/link";
import { PROSPECTS } from "@/lib/site-check/copy";

const TABS = [
  { id: "sites", href: "/sites", label: PROSPECTS.tabSites },
  { id: "prospects", href: "/prospects", label: PROSPECTS.tabProspects },
] as const;

/** The two lists under the one "Sites" item in the nav: registered sites, and prospects. */
export function SitesTabs({ current }: { current: (typeof TABS)[number]["id"] }) {
  return (
    <nav aria-label="Sites" className="flex gap-1 border-b border-border print:hidden">
      {TABS.map(({ id, href, label }) => (
        <Link
          key={id}
          href={href}
          aria-current={id === current ? "page" : undefined}
          className={`-mb-px flex min-h-12 items-center border-b-2 px-4 text-sm ${
            id === current ? "border-accent font-semibold text-accent" : "border-transparent text-muted hover:text-foreground"
          }`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
