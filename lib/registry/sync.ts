import type { RegistryEntry } from "./schema";

export interface ProjectRowForSync {
  id: string;
  registry_id: string;
  repo: string;
  owner_id: string;
}

export type SyncAction =
  | { kind: "insert"; registryId: string; repo: string }
  | { kind: "update"; registryId: string; id: string; from: string; to: string }
  | { kind: "unchanged"; registryId: string }
  | { kind: "skipped"; registryId: string; reason: string };

/**
 * Decides what registry sync should do, without touching the database.
 * Projects that exist in the database but not in the registry are left alone.
 */
export function planRegistrySync(
  entries: Iterable<RegistryEntry>,
  existing: ProjectRowForSync[],
  ownerId: string,
): SyncAction[] {
  const byRegistryId = new Map(existing.map((row) => [row.registry_id, row]));
  const actions: SyncAction[] = [];
  for (const entry of entries) {
    const row = byRegistryId.get(entry.id);
    if (!row) {
      actions.push({ kind: "insert", registryId: entry.id, repo: entry.repo });
    } else if (row.owner_id !== ownerId) {
      // The sync credential cannot change owners, and should not try.
      actions.push({ kind: "skipped", registryId: entry.id, reason: "owned by a different user" });
    } else if (row.repo !== entry.repo) {
      actions.push({ kind: "update", registryId: entry.id, id: row.id, from: row.repo, to: entry.repo });
    } else {
      actions.push({ kind: "unchanged", registryId: entry.id });
    }
  }
  return actions;
}
