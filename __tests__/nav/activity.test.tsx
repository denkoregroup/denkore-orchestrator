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

  it("keeps /audit redirecting to /activity, as a temporary redirect", async () => {
    expect(await nextConfig.redirects?.()).toEqual([{ source: "/audit", destination: "/activity", permanent: false }]);
  });
});
