import "server-only";
import { loadRegistry } from "./loader";
import type { RegistryEntry } from "./schema";

let registry: Promise<Map<string, RegistryEntry>> | null = null;

/** Loads registry/*.yaml once per server process. A failed load is retried next time. */
export function getRegistry(): Promise<Map<string, RegistryEntry>> {
  registry ??= loadRegistry().catch((e: unknown) => {
    registry = null;
    throw e;
  });
  return registry;
}
