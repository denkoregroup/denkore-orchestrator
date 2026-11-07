import { countBySeverity, finding, sortFindings, type AuditReport, type Finding } from "@/lib/audits/types";
import { diffReports } from "../diff";

const SITE = "https://example.com";
const title = finding({ check: "page.title", severity: "warn", url: `${SITE}/`, message: "No title." });
const desc = finding({ check: "page.description", severity: "warn", url: `${SITE}/`, message: "No description." });
const robots = finding({ check: "site.robots", severity: "info", url: `${SITE}/robots.txt`, message: "No robots.txt." });
const broken = finding({ check: "page.broken-link", severity: "fail", url: `${SITE}/gone`, message: "Broken link." });

function report(findings: Finding[], startedAt = "2026-11-01T10:00:00.000Z"): AuditReport {
  const sorted = sortFindings(findings);
  return {
    schemaVersion: 1,
    target: `${SITE}/`,
    startedAt,
    finishedAt: startedAt,
    pagesChecked: 1,
    findings: sorted,
    counts: countBySeverity(sorted),
  };
}

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
    const diff = diffReports(report([title, desc]), report([title, desc], "2026-11-08T10:00:00.000Z"));
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
