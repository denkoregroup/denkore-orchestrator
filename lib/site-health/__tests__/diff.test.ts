import type { Finding } from "@/lib/audits/types";
import { auditReport as report, findings } from "@/test-utils/site-reports";
import { diffReports } from "../diff";

const { noTitle: title, noDescription: desc, noRobots: robots, brokenLink: broken } = findings;

const ids = (list: Finding[]) => list.map((f) => f.id);

describe("diffReports", () => {
  it("splits findings into new, still open and fixed by id", () => {
    const diff = diffReports(report([title, desc, robots]), report([desc, robots, broken]));
    expect(ids(diff.newFindings)).toEqual([broken.id]);
    expect(ids(diff.stillOpen).sort()).toEqual([desc.id, robots.id].sort());
    expect(ids(diff.fixed)).toEqual([title.id]);
  });

  it("with an empty previous report, everything is new", () => {
    const diff = diffReports(report([]), report([title, robots]));
    expect(ids(diff.newFindings).sort()).toEqual([title.id, robots.id].sort());
    expect(diff.stillOpen).toEqual([]);
    expect(diff.fixed).toEqual([]);
  });

  it("with an empty current report, everything is fixed", () => {
    const diff = diffReports(report([title, robots]), report([]));
    expect(diff.newFindings).toEqual([]);
    expect(diff.stillOpen).toEqual([]);
    expect(ids(diff.fixed).sort()).toEqual([title.id, robots.id].sort());
  });

  it("two identical reports have nothing new and nothing fixed", () => {
    const diff = diffReports(report([title, desc]), report([title, desc], { startedAt: "2026-11-08T10:00:00.000Z" }));
    expect(diff.newFindings).toEqual([]);
    expect(diff.fixed).toEqual([]);
    expect(diff.stillOpen).toHaveLength(2);
  });

  it("matches on id, not severity: a finding that got worse is still open, at its current severity", () => {
    const worse: Finding = { ...title, severity: "fail" };
    const diff = diffReports(report([title]), report([worse]));
    expect(diff.stillOpen).toEqual([worse]);
    expect(diff.newFindings).toEqual([]);
    expect(diff.fixed).toEqual([]);
  });

  it("keeps each report's own order", () => {
    const diff = diffReports(report([title, desc, robots, broken]), report([]));
    expect(diff.fixed).toEqual(report([title, desc, robots, broken]).findings);
  });
});
