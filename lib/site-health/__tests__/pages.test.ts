import { finding } from "@/lib/audits/types";
import { groupByPage, pageRef } from "../pages";
import { summaryLine } from "../labels";

describe("pageRef", () => {
  it("shows the path under the host heading, and keeps the full address as the link", () => {
    expect(pageRef("https://example.com/about?x=1#team", "example.com")).toEqual({ path: "/about?x=1", href: "https://example.com/about?x=1#team" });
    expect(pageRef("https://example.com/", "example.com")).toEqual({ path: "/", href: "https://example.com/" });
  });

  it("keeps the host when the address is on another one (www versus the bare name)", () => {
    expect(pageRef("https://www.example.com/", "example.com")).toEqual({ path: "www.example.com/", href: "https://www.example.com/" });
  });

  it.each(["javascript:alert(document.cookie)", "data:text/html,<b>x</b>", "ftp://example.com/file", "not a url"])(
    "never makes %s a link; it is shown as the text it is",
    (raw) => {
      expect(pageRef(raw, "example.com")).toEqual({ path: raw, href: null });
    },
  );
});

describe("groupByPage", () => {
  const f = (check: string, url: string) => finding({ check, severity: "info", url, message: `${check} on ${url}` });

  it("puts each page once, in address order, with its findings in the order given", () => {
    const groups = groupByPage(
      [f("a", "https://example.com/z"), f("b", "https://example.com/"), f("c", "https://example.com/z"), f("d", "https://example.com/m")],
      "example.com",
    );
    expect(groups.map((g) => [g.path, g.findings.map((x) => x.check)])).toEqual([
      ["/", ["b"]],
      ["/m", ["d"]],
      ["/z", ["a", "c"]],
    ]);
  });

  it("is empty for no findings", () => {
    expect(groupByPage([], "example.com")).toEqual([]);
  });
});

describe("summaryLine", () => {
  it("joins the non-empty groups, worst first", () => {
    expect(summaryLine({ fail: 0, warn: 2, info: 9 })).toBe("2 worth fixing · 9 good to know");
    expect(summaryLine({ fail: 1, warn: 0, info: 3 })).toBe("1 needs fixing · 3 good to know");
    expect(summaryLine({ fail: 4, warn: 1, info: 0 })).toBe("4 need fixing · 1 worth fixing");
  });

  it("says so when there is nothing", () => {
    expect(summaryLine({ fail: 0, warn: 0, info: 0 })).toBe("No problems found");
  });
});
