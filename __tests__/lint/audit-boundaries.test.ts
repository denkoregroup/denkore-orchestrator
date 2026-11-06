/**
 * @jest-environment node
 *
 * Proves the lib/audits import boundary in eslint.config.mjs fires. Each case
 * is linted through ESLint's --stdin as if it lived at the given path; no
 * files are written.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";

jest.setTimeout(60_000);

const ESLINT = path.join(process.cwd(), "node_modules", "eslint", "bin", "eslint.js");

function restrictedImports(filePath: string, source: string): string[] {
  const result = spawnSync(process.execPath, [ESLINT, "--stdin", "--stdin-filename", filePath, "--format", "json"], {
    input: source,
    encoding: "utf8",
  });
  const [report] = JSON.parse(result.stdout) as Array<{ messages: Array<{ ruleId: string | null; message: string }> }>;
  return report.messages
    .filter((m) => m.ruleId === "no-restricted-imports")
    .map((m) => m.message.match(/^'([^']+)'/)?.[1] ?? m.message);
}

const lines = (...specifiers: string[]) =>
  specifiers.map((s, i) => `import * as m${i} from "${s}";`).join("\n") + `\nexport const all = [${specifiers.map((_, i) => `m${i}`).join(", ")}];\n`;

describe("lib/audits import boundary", () => {
  it("rejects imports from outside lib/audits in a top-level file", () => {
    const forbidden = ["@/lib/supabase/admin", "../supabase/admin", "../registry/loader", "../conductor/advance", "../../app/page", "../../components/gate-card", "crypto", "yaml", "./checks/../../registry/loader"];
    const allowed = ["node:crypto", "node:fs/promises", "zod", "parse5", "./types", "./checks/title"];
    expect(restrictedImports("lib/audits/example.ts", lines(...forbidden, ...allowed)).sort()).toEqual([...forbidden].sort());
  });

  it("lets a subfolder file go up one level, but no further", () => {
    const forbidden = ["../../supabase/env", "./../../registry/loader", "../../../app/layout"];
    const allowed = ["../types", "../fetcher", "./title", "zod"];
    expect(restrictedImports("lib/audits/checks/example.ts", lines(...forbidden, ...allowed)).sort()).toEqual([...forbidden].sort());
  });

  it("limits scripts/audit-run.ts to lib/audits, lib/registry and node built-ins", () => {
    const forbidden = ["../lib/supabase/admin", "../lib/conductor/advance", "../lib/registry/../conductor/decide", "@/lib/audits/run", "zod"];
    const allowed = ["../lib/audits/run", "../lib/registry/loader", "node:path", "node:fs/promises"];
    expect(restrictedImports("scripts/audit-run.ts", lines(...forbidden, ...allowed)).sort()).toEqual([...forbidden].sort());
  });

  it("exempts audit tests", () => {
    expect(restrictedImports("lib/audits/__tests__/example.test.ts", lines("@/test-utils/audit", "@/lib/supabase/admin"))).toEqual([]);
  });
});
