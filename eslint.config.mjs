import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/*
 * Import boundaries for the site auditor. Each rule is an allowlist written as
 * "forbid anything that is not ...". Relative paths may not contain "..", other
 * than the one leading "../" a file in a subfolder needs to reach lib/audits.
 * Test files and test-utils/ are exempt.
 */
const AUDIT_BOUNDARY_MESSAGE =
  "lib/audits may import only node:* built-ins, zod, parse5 and other files in lib/audits. Move the shared piece into lib/audits or pass it in as a parameter.";
const AUDIT_TESTS = ["**/__tests__/**", "**/*.test.ts", "**/*.test.tsx"];
const AUDIT_PACKAGES = String.raw`node:|zod$|zod/|parse5$`;

const auditBoundaries = [
  {
    // Files directly in lib/audits: only "./" relative imports.
    files: ["lib/audits/*.ts"],
    ignores: AUDIT_TESTS,
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ regex: String.raw`^(?!(?:${AUDIT_PACKAGES}|\./(?!.*\.\.)))`, message: AUDIT_BOUNDARY_MESSAGE }] },
      ],
    },
  },
  {
    // Files in a subfolder (lib/audits/checks/...): "./" or one "../", never further up.
    files: ["lib/audits/*/**/*.ts"],
    ignores: AUDIT_TESTS,
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [{ regex: String.raw`^(?!(?:${AUDIT_PACKAGES}|\.\.?/(?!.*\.\.)))`, message: AUDIT_BOUNDARY_MESSAGE }] },
      ],
    },
  },
  {
    // The audit CLI: lib/audits and lib/registry, plus node:* built-ins for files and paths.
    files: ["scripts/audit-run.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: String.raw`^(?!(?:node:|\.\./lib/(?:audits|registry)/(?!.*\.\.)))`,
              message: "scripts/audit-run.ts may import only lib/audits, lib/registry and node:* built-ins.",
            },
          ],
        },
      ],
    },
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...auditBoundaries,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
