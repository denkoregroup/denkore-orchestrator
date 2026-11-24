"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { isCurrent } from "./switch-nav";

/** The pages that aren't one of the switch's three views. */
export const MENU_ITEMS = [
  { href: "/prompt", label: "Start a run" },
  { href: "/approvals", label: "Approvals" },
  { href: "/activity", label: "Activity" },
  { href: "/prospects", label: "Prospects" },
] as const;

/** A small brass-outlined menu at the header's top right. `children` is the sign-out form. */
export function HubMenu({ children }: { children?: ReactNode }) {
  const pathname = usePathname();
  const menu = useRef<HTMLDetailsElement>(null);
  // Close it after a move to another page; the header stays in place between pages.
  useEffect(() => {
    if (menu.current) menu.current.open = false;
  }, [pathname]);

  return (
    <details ref={menu} className="relative">
      <summary className="flex min-h-11 cursor-pointer list-none items-center rounded-[10px] border border-accent px-3 text-sm font-medium text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-signal [&::-webkit-details-marker]:hidden">
        Menu
      </summary>
      <div className="absolute right-0 z-20 mt-2 w-60 space-y-2 rounded-[12px] border border-border bg-tile p-2 shadow-lg">
        <nav aria-label="More">
          <ul>
            {MENU_ITEMS.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isCurrent(pathname, item.href) ? "page" : undefined}
                  className="flex min-h-11 items-center rounded-[8px] px-3 text-sm hover:bg-background focus-visible:outline-2 focus-visible:outline-signal aria-[current=page]:font-semibold aria-[current=page]:text-accent"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="border-t border-border px-1 pt-2">{children}</div>
      </div>
    </details>
  );
}
