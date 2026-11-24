"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** The hub's three views. Everything else is in the menu. */
export const SWITCH_ITEMS = [
  { href: "/waiting", label: "Waiting on you", short: "Waiting", also: [] },
  // One view for both lists: Your sites and Prospects.
  { href: "/sites", label: "Sites", also: ["/prospects"] },
  { href: "/runs", label: "Runs", also: [] },
] as const;

export function isCurrent(pathname: string, href: string, also: readonly string[] = []) {
  return [href, ...also].some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Night Harbor's switch, under the glow header in the page's own flow: no fixed bar, so nothing
 * fights a phone browser's own toolbars. `waitingCount` is the teal count beside Waiting.
 */
export function SwitchNav({ waitingCount }: { waitingCount?: ReactNode }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="print:hidden">
      <ul className="grid grid-cols-3 gap-1 rounded-[12px] border border-border bg-tile p-1">
        {SWITCH_ITEMS.map((item) => {
          const current = isCurrent(pathname, item.href, item.also);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className="group flex min-h-11 items-center justify-center gap-1.5 rounded-[9px] px-2 text-sm text-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal aria-[current=page]:bg-foreground aria-[current=page]:font-semibold aria-[current=page]:text-background aria-[current=page]:shadow-[inset_0_-2px_0_var(--accent)]"
              >
                {"short" in item ? (
                  <>
                    {/* A phone shows the short name; the full one is still the link's name. */}
                    <span aria-hidden="true" className="sm:hidden">
                      {item.short}
                    </span>
                    <span className="max-sm:sr-only">{item.label}</span>
                    {waitingCount}
                  </>
                ) : (
                  item.label
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
