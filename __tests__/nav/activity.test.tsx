import { fireEvent, render, screen, within } from "@testing-library/react";

let pathname = "/runs";
jest.mock("next/navigation", () => ({ usePathname: () => pathname }));

import nextConfig from "@/next.config";
import { HubMenu, MENU_ITEMS } from "@/components/hub/menu";
import { SwitchNav, SWITCH_ITEMS } from "@/components/hub/switch-nav";
import { CountBadge } from "@/components/hub/waiting-count";

afterEach(() => {
  pathname = "/runs";
});

describe("the switch under the header", () => {
  it("has the three views, as real links, in the page's flow rather than a fixed bar", () => {
    expect(SWITCH_ITEMS.map((i) => i.href)).toEqual(["/waiting", "/sites", "/runs"]);
    render(<SwitchNav />);
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(nav.className).not.toMatch(/\b(fixed|sticky)\b/);
    expect(within(nav).getAllByRole("link").map((l) => l.getAttribute("href"))).toEqual(["/waiting", "/sites", "/runs"]);
  });

  it("names Waiting on you in full, with a short name for phones that screen readers skip", () => {
    render(<SwitchNav />);
    const waiting = screen.getByRole("link", { name: "Waiting on you" });
    expect(within(waiting).getByText("Waiting")).toHaveAttribute("aria-hidden", "true");
    expect(within(waiting).getByText("Waiting")).toHaveClass("sm:hidden");
    expect(within(waiting).getByText("Waiting on you")).toHaveClass("max-sm:sr-only");
  });

  it("marks the current view, with the 44px touch height and a visible focus ring", () => {
    render(<SwitchNav />);
    const runs = screen.getByRole("link", { name: "Runs" });
    expect(runs).toHaveAttribute("aria-current", "page");
    expect(runs).toHaveClass("min-h-11", "focus-visible:outline-2", "aria-[current=page]:bg-foreground");
    expect(screen.getByRole("link", { name: "Sites" })).not.toHaveAttribute("aria-current");
  });

  it("keeps one Sites view, current on both the Sites and the Prospects pages", () => {
    for (const path of ["/sites", "/sites/abc", "/prospects"]) {
      pathname = path;
      const { unmount } = render(<SwitchNav />);
      expect(screen.getByRole("link", { name: "Sites" })).toHaveAttribute("aria-current", "page");
      unmount();
    }
  });

  it("shows the teal count beside Waiting on you, read out as waiting", () => {
    render(<SwitchNav waitingCount={<CountBadge count={3} />} />);
    const waiting = screen.getByRole("link", { name: "Waiting on you 3 waiting" });
    expect(within(waiting).getByText("3")).toHaveClass("text-signal", "group-aria-[current=page]:text-abyss");
  });

  it("shows no count when nothing waits", () => {
    const { container } = render(<CountBadge count={0} />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("the menu", () => {
  it("holds every other page and the sign-out form", () => {
    expect(MENU_ITEMS.map((i) => i.label)).toEqual(["Start a run", "Approvals", "Activity", "Prospects"]);
    render(
      <HubMenu>
        <button type="submit">Sign out</button>
      </HubMenu>,
    );
    const more = screen.getByRole("navigation", { name: "More", hidden: true });
    expect(within(more).getByRole("link", { name: "Activity", hidden: true })).toHaveAttribute("href", "/activity");
    expect(screen.getByRole("button", { name: "Sign out", hidden: true })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Audit", hidden: true })).toBeNull();
  });

  it("opens from a brass-outlined button and closes after a move to another page", () => {
    pathname = "/activity";
    const { container, rerender } = render(<HubMenu />);
    const details = container.querySelector("details")!;
    expect(screen.getByText("Menu")).toHaveClass("border-accent", "text-accent", "min-h-11");
    fireEvent.click(screen.getByText("Menu"));
    details.open = true;
    expect(screen.getByRole("link", { name: "Activity" })).toHaveAttribute("aria-current", "page");
    pathname = "/approvals";
    rerender(<HubMenu />);
    expect(details.open).toBe(false);
  });
});

describe("Activity (formerly Audit)", () => {
  it("keeps /audit redirecting to /activity, as a temporary redirect", async () => {
    expect(await nextConfig.redirects?.()).toEqual([{ source: "/audit", destination: "/activity", permanent: false }]);
  });
});
