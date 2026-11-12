/**
 * @jest-environment node
 */
import { loadRegistry } from "../loader";
import { planRegistrySync } from "../sync";
import { EXAMPLE_REGISTRY_DIR } from "@/test-utils/registry";

const OWNER = "6f1c2b9e-4a3d-4c1e-9b7a-2d5e8f0a1b3c";
const OTHER = "7a2d3c0f-5b4e-4d2f-8c8b-3e6f9a1b2c4d";

async function entries() {
  const registry = await loadRegistry(EXAMPLE_REGISTRY_DIR);
  return [...registry.values()];
}

describe("planRegistrySync", () => {
  it("inserts entries that have no project row", async () => {
    expect(planRegistrySync(await entries(), [], OWNER)).toEqual([
      { kind: "insert", registryId: "example-app", repo: "denkoregroup/example-app" },
    ]);
  });

  it("leaves a matching row alone", async () => {
    const rows = [{ id: "p1", registry_id: "example-app", repo: "denkoregroup/example-app", owner_id: OWNER }];
    expect(planRegistrySync(await entries(), rows, OWNER)).toEqual([
      { kind: "unchanged", registryId: "example-app" },
    ]);
  });

  it("changes only the repo when it moved", async () => {
    const rows = [{ id: "p1", registry_id: "example-app", repo: "old/name", owner_id: OWNER }];
    expect(planRegistrySync(await entries(), rows, OWNER)).toEqual([
      { kind: "update", registryId: "example-app", id: "p1", from: "old/name", to: "denkoregroup/example-app" },
    ]);
  });

  it("never touches a project owned by someone else", async () => {
    const rows = [{ id: "p1", registry_id: "example-app", repo: "old/name", owner_id: OTHER }];
    expect(planRegistrySync(await entries(), rows, OWNER)[0].kind).toBe("skipped");
  });
});
