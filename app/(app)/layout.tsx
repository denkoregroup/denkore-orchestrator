import { Suspense } from "react";
import { Nav } from "@/components/nav";
import { OwnerBadge } from "@/components/owner-badge";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-full flex-1 flex-col md:flex-row">
      <aside className="md:w-48 md:shrink-0 print:hidden">
        <Nav />
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between gap-4 border-b border-border px-4 py-3 print:hidden">
          <span className="font-semibold">Denkore</span>
          <Suspense fallback={<span className="text-sm text-muted">…</span>}>
            <OwnerBadge />
          </Suspense>
        </header>
        {/* Bottom padding clears the fixed mobile nav. Nothing but the page itself prints: no nav, no sign-out. */}
        <main className="flex-1 px-4 py-6 pb-24 md:pb-6 print:p-0">{children}</main>
      </div>
    </div>
  );
}
