/**
 * @jest-environment node
 */
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { stringify } from "yaml";
import { loadRegistry, parseRegistryEntry, RegistryError } from "..";
import { EXAMPLE_REGISTRY_DIR } from "@/test-utils/registry";

const REGISTRY_DIR = EXAMPLE_REGISTRY_DIR;

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

describe("registry audits block", () => {
  it("is optional, and the example entry has one", async () => {
    const entry = await exampleObject();
    expect(entry.audits).toEqual({ url: "https://example.com", maxPages: 10, ignorePaths: ["/admin"] });
    const withoutAudits: Partial<typeof entry> = { ...entry };
    delete withoutAudits.audits;
    expect(() => parseRegistryEntry(stringify(withoutAudits))).not.toThrow();
  });

  it("requires a url inside the block", async () => {
    const entry = { ...(await exampleObject()), audits: { maxPages: 5 } };
    expect(() => parseRegistryEntry(stringify(entry))).toThrow(/url/);
  });

  it("accepts only url, maxPages and ignorePaths", async () => {
    const entry = { ...(await exampleObject()), audits: { url: "https://example.com", propertyId: "G-123" } };
    expect(() => parseRegistryEntry(stringify(entry))).toThrow(/propertyId/);
  });

  it("rejects a non-web url and ignore paths that don't start with /", async () => {
    const base = await exampleObject();
    expect(() => parseRegistryEntry(stringify({ ...base, audits: { url: "ftp://example.com" } }))).toThrow(RegistryError);
    expect(() => parseRegistryEntry(stringify({ ...base, audits: { url: "https://example.com", ignorePaths: ["admin"] } }))).toThrow(/start with/);
  });
});

describe("the v1 registry (registry/*.yaml)", () => {
  it("is exactly denkore.com, ggrmusic.com and dclarkdev.com, each with an audits block", async () => {
    const registry = await loadRegistry();
    expect([...registry.keys()].sort()).toEqual(["dclarkdev-com", "denkore-com", "ggrmusic-com"]);
    expect([...registry.values()].map((e) => new URL(e.audits!.url).host).sort()).toEqual([
      "dclarkdev.com",
      "www.denkore.com",
      "www.ggrmusic.com",
    ]);
  });

  it("does not include denkoregroup.com, which is not a Denkore build", async () => {
    const registry = await loadRegistry();
    for (const entry of registry.values()) expect(new URL(entry.audits!.url).host).not.toMatch(/denkoregroup/);
  });
});
