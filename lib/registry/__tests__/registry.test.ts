/**
 * @jest-environment node
 */
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { stringify } from "yaml";
import { loadRegistry, parseRegistryEntry, RegistryError } from "..";

const REGISTRY_DIR = path.join(__dirname, "..", "..", "..", "registry");

async function exampleObject() {
  return parseRegistryEntry(await readFile(path.join(REGISTRY_DIR, "example-app.yaml"), "utf8"));
}

describe("registry", () => {
  it("loads the example entry", async () => {
    const registry = await loadRegistry(REGISTRY_DIR);
    const entry = registry.get("example-app");
    expect(entry).toMatchObject({ repo: "denkoregroup/example-app", gateTier: "app" });
    expect(entry?.gates.prReview).toContain("release");
  });

  it("rejects an integration that carries a value instead of a name", async () => {
    const entry = await exampleObject();
    entry.integrations[0].envVars = ["SUPABASE_URL=https://example.supabase.co"];
    expect(() => parseRegistryEntry(stringify(entry))).toThrow(RegistryError);
  });

  it("rejects unknown keys", async () => {
    const entry = { ...(await exampleObject()), apiKey: "x" };
    expect(() => parseRegistryEntry(stringify(entry))).toThrow(/apiKey/);
  });

  it("rejects an unknown gate tier", async () => {
    const entry = { ...(await exampleObject()), gateTier: "none" };
    expect(() => parseRegistryEntry(stringify(entry))).toThrow(RegistryError);
  });

  it("rejects a gate listed as both one-tap and PR-review", async () => {
    const entry = await exampleObject();
    entry.gates.oneTap.push("release");
    expect(() => parseRegistryEntry(stringify(entry))).toThrow(/both one-tap and PR-review/);
  });

  it("requires PR review for the infra release gate", async () => {
    const entry = { ...(await exampleObject()), gateTier: "infra" as const };
    entry.gates = { oneTap: ["release"], prReview: [] };
    expect(() => parseRegistryEntry(stringify(entry))).toThrow(/infra tier/);
  });

  it("rejects duplicate ids across files", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "registry-"));
    const source = stringify(await exampleObject());
    await writeFile(path.join(dir, "a.yaml"), source);
    await writeFile(path.join(dir, "b.yaml"), source);
    await expect(loadRegistry(dir)).rejects.toThrow(/duplicate registry id/);
  });
});
