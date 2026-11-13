import { render, screen } from "@testing-library/react";

let pathname = "/runs";
jest.mock("next/navigation", () => ({ usePathname: () => pathname }));

import nextConfig from "@/next.config";
import { Nav, NAV_ITEMS } from "@/components/nav";

describe("Activity (formerly Audit)", () => {
  it("is named Activity in the nav and links to /activity, with no Audit item left", () => {
    expect(NAV_ITEMS.map((i) => i.label)).toEqual(["Prompt", "Runs", "Approvals", "Sites", "Activity"]);
    render(<Nav />);
    expect(screen.getByRole("link", { name: "Activity" })).toHaveAttribute("href", "/activity");
    expect(screen.queryByRole("link", { name: "Audit" })).toBeNull();
  });

  it("marks Activity as the current page on /activity", () => {
    pathname = "/activity";
    render(<Nav />);
    expect(screen.getByRole("link", { name: "Activity" })).toHaveAttribute("aria-current", "page");
  });

  it("keeps one Sites item, and marks it on both the Sites and the Prospects pages", () => {
    expect(NAV_ITEMS.filter((i) => i.label === "Sites")).toHaveLength(1);
    for (const path of ["/sites", "/sites/abc", "/prospects"]) {
      pathname = path;
      const { unmount } = render(<Nav />);
      expect(screen.getByRole("link", { name: "Sites" })).toHaveAttribute("aria-current", "page");
      unmount();
    }
    pathname = "/runs";
    render(<Nav />);
    expect(screen.getByRole("link", { name: "Sites" })).not.toHaveAttribute("aria-current");
  });

  it("keeps /audit redirecting to /activity, as a temporary redirect", async () => {
    expect(await nextConfig.redirects?.()).toEqual([{ source: "/audit", destination: "/activity", permanent: false }]);
  });
});
