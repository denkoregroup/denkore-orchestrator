import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { registryEntrySchema, type RegistryEntry } from "./schema";

export const DEFAULT_REGISTRY_DIR = path.join(process.cwd(), "registry");

export class RegistryError extends Error {
  constructor(
    readonly file: string,
    message: string,
  ) {
    super(`${file}: ${message}`);
    this.name = "RegistryError";
  }
}

export function parseRegistryEntry(source: string, file = "<inline>"): RegistryEntry {
  let raw: unknown;
  try {
    raw = parse(source);
  } catch (e) {
    throw new RegistryError(file, `invalid YAML: ${(e as Error).message}`);
  }
  const result = registryEntrySchema.safeParse(raw);
  if (!result.success) {
    throw new RegistryError(file, z.prettifyError(result.error));
  }
  return result.data;
}

/** Loads and validates every registry/*.yaml file. Throws on the first invalid entry or a duplicate id. */
export async function loadRegistry(dir = DEFAULT_REGISTRY_DIR): Promise<Map<string, RegistryEntry>> {
  // turbopackIgnore stops the bundler tracing the whole project for these
  // dynamic paths; next.config.ts ships registry/*.yaml explicitly instead.
  const files = (await readdir(/* turbopackIgnore: true */ dir)).filter((f) => /\.ya?ml$/.test(f)).sort();
  const entries = new Map<string, RegistryEntry>();
  for (const file of files) {
    const entry = parseRegistryEntry(await readFile(path.join(/* turbopackIgnore: true */ dir, file), "utf8"), file);
    if (entries.has(entry.id)) {
      throw new RegistryError(file, `duplicate registry id "${entry.id}"`);
    }
    entries.set(entry.id, entry);
  }
  return entries;
}
