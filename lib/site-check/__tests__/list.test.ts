/** @jest-environment node */
import { finding } from "@/lib/audits/types";
import { auditReport, TARGET } from "@/test-utils/site-reports";
import { summarizeForList } from "../list";

const f = (check: string, severity: "info" | "warn" | "fail", key = "") => finding({ check, severity, url: TARGET, key, message: "m" });
const og = ["og:title", "og:description", "og:image"].map((k) => f("page.open-graph", "info", k));

describe("summarizeForList", () => {
  it("says how many areas to fix first, with the lights in their fixed order", () => {
    const s = summarizeForList(auditReport([...og, f("page.title", "fail")]));
    expect(s.status).toBe("2 to fix first");
    expect(s.lights).toEqual(["red", "red", "green", "green"]);
    expect(s.dotsLabel).toBe("2 fix first, 0 needs work, 2 good");
  });

  it("says one to fix first in the singular form the issue gives", () => {
    const s = summarizeForList(auditReport(og));
    expect(s.status).toBe("1 to fix first");
    expect(s.dotsLabel).toBe("1 fix first, 0 needs work, 3 good");
  });

  it("with nothing red but something amber, says how many to work on", () => {
    const s = summarizeForList(auditReport([f("page.description", "warn")]));
    expect(s.status).toBe("1 to work on");
    expect(s.lights).toEqual(["green", "amber", "green", "green"]);
    expect(s.dotsLabel).toBe("0 fix first, 1 needs work, 3 good");
  });

  it("says looking good when every light is green", () => {
    const s = summarizeForList(auditReport([]));
    expect(s.status).toBe("looking good");
    expect(s.dotsLabel).toBe("0 fix first, 0 needs work, 4 good");
  });

  it("has no dots for a site that did not load", () => {
    const s = summarizeForList(auditReport([f("site.unreachable", "warn")]));
    expect(s).toEqual({ status: "couldn't load", lights: [], dotsLabel: null });
  });
});
