import path from "node:path";

/** The directory holding the sample registry entry (example-app) the tests load. Not the real registry. */
export const EXAMPLE_REGISTRY_DIR = path.join(process.cwd(), "test-utils", "registry");
