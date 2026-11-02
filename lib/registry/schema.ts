import { z } from "zod";

/** Env var names only. A value (anything with "=", spaces, or lowercase) is rejected. */
export const envVarName = z
  .string()
  .regex(/^[A-Z][A-Z0-9_]*$/, "must be an env var NAME (UPPER_SNAKE_CASE), never a value");

export const gateTier = z.enum(["app", "infra", "exempt"]);

export const gateKind = z.enum(["spec", "design", "release"]);

export const integration = z.strictObject({
  name: z.string().min(1),
  envVars: z.array(envVarName).min(1),
});

/**
 * Public-URL site audits (pnpm audit:run --project <id>). Only what slice 1
 * uses; later slices add their own fields when they need them.
 */
export const auditsConfig = z.strictObject({
  url: z.url({ protocol: /^https?$/ }),
  maxPages: z.number().int().positive().max(500).optional(),
  ignorePaths: z.array(z.string().startsWith("/", "must start with /")).optional(),
});

export const registryEntrySchema = z
  .strictObject({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/, "lowercase kebab-case"),
    repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/, "owner/name"),
    gateTier,
    hosting: z.strictObject({
      provider: z.string().min(1),
      project: z.string().min(1).optional(),
    }),
    stack: z.array(z.string().min(1)).min(1),
    design: z.strictObject({
      system: z.string().min(1),
      source: z.string().min(1).optional(),
    }),
    integrations: z.array(integration).default([]),
    phase: z.enum(["discovery", "build", "launch", "maintain"]),
    tracker: z.strictObject({
      provider: z.string().min(1),
      project: z.string().min(1),
    }),
    backlog: z.string().min(1),
    constraints: z.array(z.string().min(1)).default([]),
    gates: z.strictObject({
      oneTap: z.array(gateKind).default([]),
      prReview: z.array(gateKind).default([]),
    }),
    criticalFlowsPath: z.string().min(1),
    audits: auditsConfig.optional(),
  })
  .superRefine((entry, ctx) => {
    const overlap = entry.gates.oneTap.filter((g) => entry.gates.prReview.includes(g));
    for (const g of overlap) {
      ctx.addIssue({
        code: "custom",
        path: ["gates"],
        message: `gate "${g}" cannot be both one-tap and PR-review`,
      });
    }
    if (entry.gateTier === "infra" && entry.gates.oneTap.includes("release")) {
      ctx.addIssue({
        code: "custom",
        path: ["gates", "oneTap"],
        message: "infra tier requires PR review for the release gate",
      });
    }
  });

export type RegistryEntry = z.infer<typeof registryEntrySchema>;
