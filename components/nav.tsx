"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const NAV_ITEMS = [
  { href: "/prompt", label: "Prompt" },
  { href: "/runs", label: "Runs" },
  { href: "/approvals", label: "Approvals" },
  // One item for both lists: Your sites and Prospects.
  { href: "/sites", label: "Sites", also: ["/prospects"] },
  { href: "/activity", label: "Activity" },
] as const;

export function Nav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-border bg-background pb-[env(safe-area-inset-bottom)] md:static md:border-t-0 md:border-r md:pb-0"
    >
      <ul className="grid grid-cols-5 md:flex md:flex-col md:gap-1 md:p-3">
        {NAV_ITEMS.map((item) => {
          const { href, label } = item;
          const paths = [href, ...("also" in item ? item.also : [])];
          const active = paths.some((p) => pathname === p || pathname.startsWith(`${p}/`));
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-12 items-center justify-center text-sm md:justify-start md:rounded-md md:px-3 ${
                  active ? "font-semibold text-accent" : "text-muted hover:text-foreground"
                }`}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
