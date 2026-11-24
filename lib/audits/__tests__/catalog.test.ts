/** @jest-environment node */
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { CHECK_CATALOG, checkInfo } from "../checks/catalog";

const CHECKS_DIR = path.join(process.cwd(), "lib", "audits", "checks");

/** Every check id a check file can write, found in the source so a new check cannot be forgotten. */
function emittedCheckIds(): string[] {
  const ids = new Set<string>();
  for (const file of readdirSync(CHECKS_DIR).filter((f) => f.endsWith(".ts") && f !== "catalog.ts" && f !== "index.ts")) {
    for (const match of readFileSync(path.join(CHECKS_DIR, file), "utf8").matchAll(/check:\s*"([a-z]+\.[a-z0-9-]+)"/g)) ids.add(match[1]);
  }
  return [...ids].sort();
}

describe("the check catalog", () => {
  it("has an entry for every check id the checks write, and no other", () => {
    expect(Object.keys(CHECK_CATALOG).sort()).toEqual(emittedCheckIds());
  });

  it("marks what code can fix, and what needs a person", () => {
    const fixable = Object.entries(CHECK_CATALOG).filter(([, info]) => info.fixableInCode).map(([id]) => id).sort();
    expect(fixable).toEqual([
      "page.broken-link",
      "page.canonical",
      "page.description",
      "page.h1",
      "page.image-alt",
      "page.json-ld",
      "page.lang",
      "page.open-graph",
      "page.title",
      "page.viewport",
      "site.robots",
      "site.sitemap",
    ]);
  });

  it("gives every check that code cannot fix a one-line instruction", () => {
    for (const [id, info] of Object.entries(CHECK_CATALOG)) {
      if (info.fixableInCode) continue;
      expect([id, info.needsYou.length > 0]).toEqual([id, true]);
      expect(info.needsYou).not.toMatch(/\n/);
    }
  });

  it("treats a check it does not know as needing a person, never as fixable", () => {
    expect(checkInfo("page.something-new")).toEqual({ fixableInCode: false, needsYou: "This one needs a person to look at it." });
    expect(checkInfo("toString")).toMatchObject({ fixableInCode: false });
    expect(checkInfo("page.title")).toEqual({ fixableInCode: true });
  });
});
