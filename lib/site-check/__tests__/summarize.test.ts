/** @jest-environment node */
import { countBySeverity, finding, sortFindings, type AuditReport, type Finding, type Severity } from "@/lib/audits/types";
import { FIXES } from "../copy";
import { AREA_CHECKS, FIX_PRIORITY, summarizeForProspect, type AreaId, type Light } from "../summarize";

const TARGET = "https://denkore.com/";
const OG = ["og:title", "og:description", "og:image"];

function f(check: string, severity: Severity, url = TARGET, key = "", extra: Partial<Finding> = {}): Finding {
  return { ...finding({ check, severity, url, key, message: `${check} message` }), ...extra };
}
const og = (url: string, tags = OG) => tags.map((t) => f("page.open-graph", "info", url, t));

function report(findings: Finding[], target = TARGET): AuditReport {
  const sorted = sortFindings(findings);
  return {
    schemaVersion: 1,
    target,
    startedAt: "2026-11-13T10:00:00.000Z",
    finishedAt: "2026-11-13T10:00:09.000Z",
    pagesChecked: 3,
    findings: sorted,
    counts: countBySeverity(sorted),
  };
}
const lights = (r: AuditReport) => Object.fromEntries(summarizeForProspect(r).areas.map((a) => [a.id, a.light])) as Record<AreaId, Light>;
const headline = (r: AuditReport) => {
  const h = summarizeForProspect(r).headline;
  return h.before + h.light + h.after;
};
const slow = (severity: Severity) => f("page.slow", severity, TARGET);

describe("the stored denkore.com report", () => {
  const denkore = report([
    ...og(TARGET),
    f("site.sitemap", "warn", "https://denkore.com/sitemap.xml"),
    f("page.description", "warn"),
    f("page.canonical", "info"),
    f("site.robots", "info", "https://denkore.com/robots.txt"),
    slow("info"),
    f("site.security-headers", "info", TARGET, "csp"),
  ]);
  const summary = summarizeForProspect(denkore);

  it("is sharing red, google amber, speed amber and safety green", () => {
    expect(summary.reachable).toBe(true);
    expect(summary.areas.map((a) => [a.id, a.title, a.light, a.status])).toEqual([
      ["sharing", "Looks right when shared", "red", "Fix first"],
      ["google", "Found on Google", "amber", "Needs work"],
      ["speed", "Speed", "amber", "Needs work"],
      ["safety", "Safety", "green", "Good"],
    ]);
  });

  it("says the site is invisible when shared, with the middle word set apart", () => {
    expect(summary.headline).toEqual({ before: "Solid site, ", light: "invisible", after: " when shared." });
    expect(headline(denkore)).toBe("Solid site, invisible when shared.");
  });

  it("writes the supporting sentence from the matching phrases", () => {
    expect(summary.supporting).toBe(
      "It loads, and it's secure. But shared links show up blank, Google is missing a few details and it's slow to start loading.",
    );
  });

  it("puts open graph, the sitemap and the description first, and never the optional security settings", () => {
    expect(summary.topFixes).toEqual([FIXES["page.open-graph"], FIXES["site.sitemap"], FIXES["page.description"]]);
    expect(summary.topFixes[0]).toEqual({
      title: "Add link previews",
      outcome: "Shared links show your picture, name and a line about you instead of a blank box.",
    });
    expect(summary.topFixes[1]).toEqual({
      title: "Give Google a map of your site",
      outcome: "A sitemap helps Google find every page you add, not just the homepage.",
    });
  });

  it("counts every finding and explains each light", () => {
    expect(summary.totalFindings).toBe(denkore.findings.length);
    expect(summary.areas.find((a) => a.id === "safety")!.why).toBe(
      "Your site uses a secure connection. A few optional settings could make it safer still.",
    );
    expect(summary.areas.find((a) => a.id === "sharing")!.why).toBe("Shared links show up as a blank box.");
  });
});

describe("an all-green report", () => {
  it("is green everywhere, in good shape, with nothing to fix", () => {
    const s = summarizeForProspect(report([]));
    expect(s.areas.map((a) => a.light)).toEqual(["green", "green", "green", "green"]);
    expect(s.areas.map((a) => a.status)).toEqual(["Good", "Good", "Good", "Good"]);
    expect(s.headline).toEqual({ before: "Your site is in ", light: "good shape", after: "." });
    expect(s.supporting).toBe("It loads, and it's secure.");
    expect(s.topFixes).toEqual([]);
    expect(s.totalFindings).toBe(0);
  });

  it("stays green with only the optional security settings missing, and says so", () => {
    const s = summarizeForProspect(report([f("site.security-headers", "info", TARGET, "hsts")]));
    expect(s.areas.find((a) => a.id === "safety")).toMatchObject({ light: "green", why: expect.stringContaining("optional settings") });
    expect(s.headline.light).toBe("good shape");
    expect(s.topFixes).toEqual([]);
  });
});

describe("an unreachable site", () => {
  const unreachable = report([f("site.unreachable", "warn", TARGET, "", { evidence: "Network error: getaddrinfo ENOTFOUND" })]);

  it("says so, with no areas and no fixes", () => {
    const s = summarizeForProspect(unreachable);
    expect(s.reachable).toBe(false);
    expect(headline(unreachable)).toBe("We couldn't load your site.");
    expect(s.areas).toEqual([]);
    expect(s.topFixes).toEqual([]);
    expect(s.totalFindings).toBe(1);
  });

  it("ignores every other finding", () => {
    const s = summarizeForProspect(report([f("site.unreachable", "warn"), ...og(TARGET), f("site.https", "fail")]));
    expect(s.reachable).toBe(false);
    expect(s.areas).toEqual([]);
  });
});

describe("a site without HTTPS", () => {
  const insecure = report([f("site.https", "fail", "http://denkore.com/", "not-secure")], "http://denkore.com/");

  it("is safety red and leads with that headline", () => {
    expect(lights(insecure).safety).toBe("red");
    expect(summarizeForProspect(insecure).areas.find((a) => a.id === "safety")).toMatchObject({
      status: "Fix first",
      why: "Browsers show your visitors a “Not secure” warning.",
    });
    expect(summarizeForProspect(insecure).headline).toEqual({ before: "Your site shows as ", light: "not secure", after: "." });
  });

  it("does not say it's secure, and adds no 'But' when nothing else is wrong", () => {
    expect(summarizeForProspect(insecure).supporting).toBe("It loads.");
  });

  it("offers the HTTPS fix first", () => {
    expect(summarizeForProspect(insecure).topFixes).toEqual([FIXES["site.https"]]);
  });

  it("is red for any site.https finding, even the informational one", () => {
    expect(lights(report([f("site.https", "info", "http://denkore.com/", "http-unreachable")])).safety).toBe("red");
  });
});

describe("light rules at their boundaries", () => {
  it("sharing: red only when the homepage misses all three tags", () => {
    expect(lights(report(og(TARGET))).sharing).toBe("red");
    expect(lights(report(og(TARGET, OG.slice(0, 2)))).sharing).toBe("amber");
    expect(lights(report(og(TARGET, OG.slice(0, 1)))).sharing).toBe("amber");
    expect(lights(report([])).sharing).toBe("green");
  });

  it("sharing: all three missing on another page is only amber", () => {
    expect(lights(report(og("https://denkore.com/about"))).sharing).toBe("amber");
  });

  it("sharing: the homepage is matched by address, not by exact spelling", () => {
    expect(lights(report(og("https://denkore.com/"), "https://DENKORE.com")).sharing).toBe("red");
  });

  it("sharing: partial and all-missing use different words", () => {
    expect(summarizeForProspect(report(og(TARGET, ["og:image"]))).supporting).toBe(
      "It loads, and it's secure. But shared links are missing details.",
    );
    expect(summarizeForProspect(report(og(TARGET))).supporting).toBe("It loads, and it's secure. But shared links show up blank.");
  });

  it("google: one info is green, two are amber", () => {
    expect(lights(report([f("page.canonical", "info")])).google).toBe("green");
    expect(lights(report([f("page.canonical", "info"), f("site.robots", "info", "https://denkore.com/robots.txt")])).google).toBe("amber");
  });

  it("google: two info findings of one check count as two", () => {
    expect(lights(report([f("page.canonical", "info"), f("page.canonical", "info", "https://denkore.com/about")])).google).toBe("amber");
  });

  it("google: one warn is amber, one fail is red", () => {
    expect(lights(report([f("page.description", "warn")])).google).toBe("amber");
    expect(lights(report([f("page.title", "fail")])).google).toBe("red");
    expect(lights(report([f("page.title", "fail"), f("page.description", "warn")])).google).toBe("red");
  });

  it("google: findings from other checks do not count", () => {
    expect(lights(report([f("page.h1", "fail"), f("page.h1", "warn", "https://denkore.com/a"), f("site.start", "fail")])).google).toBe("green");
  });

  it("speed: info is amber, warn and fail are red", () => {
    expect(lights(report([slow("info")])).speed).toBe("amber");
    expect(lights(report([slow("warn")])).speed).toBe("red");
    expect(lights(report([slow("fail")])).speed).toBe("red");
    expect(lights(report([slow("info"), f("page.slow", "warn", "https://denkore.com/a")])).speed).toBe("red");
  });

  it("safety: only site.https turns it red", () => {
    expect(lights(report([f("site.security-headers", "info", TARGET, "a"), f("site.security-headers", "info", TARGET, "b")])).safety).toBe("green");
  });
});

describe("headline, first match wins", () => {
  const notSecure = f("site.https", "fail", "http://denkore.com/", "not-secure");
  const googleRed = f("page.title", "fail");
  const sharingRed = og(TARGET);
  const speedRed = slow("warn");

  it("safety red beats everything", () => {
    expect(headline(report([notSecure, googleRed, ...sharingRed, speedRed]))).toBe("Your site shows as not secure.");
  });
  it("then google red", () => {
    expect(headline(report([googleRed, ...sharingRed, speedRed]))).toBe("Solid site, hard to find on Google.");
  });
  it("then sharing red", () => {
    expect(headline(report([...sharingRed, speedRed]))).toBe("Solid site, invisible when shared.");
  });
  it("then speed red", () => {
    expect(headline(report([speedRed]))).toBe("Solid site, slow to open.");
  });
  it("then any amber", () => {
    expect(headline(report([f("page.description", "warn")]))).toBe("Good site, a few easy wins.");
    expect(headline(report([slow("info")]))).toBe("Good site, a few easy wins.");
  });
});

describe("supporting sentence", () => {
  it("joins two phrases with 'and' and three with commas and a final 'and'", () => {
    expect(summarizeForProspect(report([f("page.description", "warn"), slow("info")])).supporting).toBe(
      "It loads, and it's secure. But Google is missing a few details and it's slow to start loading.",
    );
  });

  it("lists other problems after the secure clause only when the site is secure", () => {
    const s = summarizeForProspect(report([f("site.https", "fail", "http://denkore.com/", "x"), slow("info")])).supporting;
    expect(s).toBe("It loads. But it's slow to start loading.");
  });
});

describe("top three fixes", () => {
  const many = report([
    ...og("https://denkore.com/about", ["og:image"]), // sharing amber
    f("page.broken-link", "fail", "https://denkore.com/gone"), // google red
    f("page.broken-link", "fail", "https://denkore.com/gone2"),
    f("page.lang", "warn"),
    f("site.sitemap", "warn", "https://denkore.com/sitemap.xml"),
    f("site.security-headers", "info", TARGET, "csp"),
  ]);

  it("takes one per check, red areas before amber, then the priority order", () => {
    const titles = summarizeForProspect(many).topFixes.map((x) => x.title);
    // google is red (a failing link), sharing amber: google's checks come first, in priority order.
    expect(titles).toEqual([FIXES["site.sitemap"].title, FIXES["page.broken-link"].title, FIXES["page.lang"].title]);
  });

  it("puts a red area ahead of an amber one whatever the priority", () => {
    const r = report([...og("https://denkore.com/about", ["og:image"]), f("site.robots", "info", "https://denkore.com/robots.txt"), f("page.title", "fail")]);
    expect(summarizeForProspect(r).topFixes.map((x) => x.title)).toEqual([FIXES["page.title"].title, FIXES["site.robots"].title, FIXES["page.open-graph"].title]);
  });

  it("returns fewer than three when there are fewer, and never more than three", () => {
    expect(summarizeForProspect(report([f("page.description", "warn")])).topFixes).toHaveLength(1);
    const lots = report([
      ...og(TARGET),
      f("site.https", "fail", "http://denkore.com/", "x"),
      f("page.title", "fail"),
      f("page.viewport", "fail"),
      f("page.description", "warn"),
    ]);
    expect(summarizeForProspect(lots).topFixes).toHaveLength(3);
  });

  it("never offers site.security-headers, and skips checks in a green area", () => {
    const titles = summarizeForProspect(report([f("site.security-headers", "info", TARGET, "x"), f("page.canonical", "info")])).topFixes;
    expect(titles).toEqual([]);
  });
});

describe("the rules and the copy agree", () => {
  it("has a fix line for every check that can be a fix, and in the priority list", () => {
    expect([...FIX_PRIORITY].sort()).toEqual(Object.keys(FIXES).sort());
  });

  it("feeds every fix check into exactly one area, and the issue's checks into the right ones", () => {
    const all = Object.values(AREA_CHECKS).flat();
    expect(new Set(all).size).toBe(all.length);
    for (const check of FIX_PRIORITY) expect(all).toContain(check);
    expect(AREA_CHECKS.sharing).toEqual(["page.open-graph"]);
    expect(AREA_CHECKS.speed).toEqual(["page.slow"]);
    expect(AREA_CHECKS.safety).toEqual(["site.https", "site.security-headers"]);
    expect(AREA_CHECKS.google).toHaveLength(12);
  });
});

describe("untrusted text", () => {
  it("never appears in the result: every word is from the copy file", () => {
    const hostile = "<script>alert(1)</script> javascript:alert(1)";
    const r = report([
      f("page.description", "warn", "javascript:alert(1)", "", { message: hostile, evidence: hostile }),
      ...og(TARGET).map((x) => ({ ...x, message: hostile })),
    ]);
    const out = JSON.stringify(summarizeForProspect(r));
    expect(out).not.toContain("<script");
    expect(out).not.toContain("alert");
    expect(out).not.toContain("javascript");
  });
});
