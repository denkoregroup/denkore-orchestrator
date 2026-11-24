import { Suspense } from "react";
import { HubMenu } from "@/components/hub/menu";
import { SwitchNav } from "@/components/hub/switch-nav";
import { WaitingCount } from "@/components/hub/waiting-count";
import { OwnerBadge } from "@/components/owner-badge";

/**
 * Night Harbor's frame: the glow header (with the big count on Waiting on you, from the summary
 * slot), the three-way switch right under it in the page's own flow, then the page. No fixed bar.
 */
export default function AppLayout({ children, summary }: LayoutProps<"/">) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="harbor-header mx-auto w-full max-w-2xl px-4 pt-4 pb-5 md:mt-4 md:rounded-[14px] md:px-5 print:hidden">
        <div className="flex items-center justify-between gap-4">
          <span className="font-semibold tracking-tight">Denkore</span>
          <HubMenu>
            <Suspense fallback={<span className="text-sm text-muted">…</span>}>
              <OwnerBadge />
            </Suspense>
          </HubMenu>
        </div>
        <Suspense fallback={null}>{summary}</Suspense>
      </header>
      <div className="mx-auto w-full max-w-2xl px-4 pt-3">
        <SwitchNav
          waitingCount={
            <Suspense fallback={null}>
              <WaitingCount />
            </Suspense>
          }
        />
      </div>
      {/* Nothing but the page itself prints: no header, menu or switch. */}
      <main className="flex-1 px-4 py-6 print:p-0">{children}</main>
    </div>
  );
}
