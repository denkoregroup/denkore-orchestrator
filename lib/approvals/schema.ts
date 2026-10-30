import { z } from "zod";

/** The plain-language summary an agent attaches to a gate, at result.gateReview in the step output. */
export const gateReviewSchema = z.object({
  /** One sentence, no jargon: what happens if this is approved. */
  headline: z.string().trim().min(1),
  summary: z.string().trim().min(1),
  changes: z.array(z.string().trim().min(1)),
  risks: z.array(z.string().trim().min(1)),
});

export type GateReviewSummary = z.infer<typeof gateReviewSchema>;

/** Optional technical extras a step output may carry. Each is parsed on its own. */
export const gateTechnicalSchema = {
  branch: z.string().trim().min(1),
  filesChanged: z.number().int().nonnegative(),
  checks: z.array(
    z.object({
      name: z.string().trim().min(1),
      status: z.enum(["passed", "failed", "pending"]),
    }),
  ),
};
