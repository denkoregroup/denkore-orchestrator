import type { AuditReport } from "@/lib/audits/types";
import { PROSPECTS } from "./copy";
import { summarizeForProspect, type Light } from "./summarize";

export interface ListSummary {
  /** "1 to fix first", "2 to work on", "looking good", or "couldn't load". */
  status: string;
  /** The four areas' lights in their fixed order; empty when the site didn't load. */
  lights: Light[];
  /** What the dots say, with the counts; null when there are no dots. */
  dotsLabel: string | null;
}

/** One recent check as a line: a short status and four small lights, from the same rules as the site check. */
export function summarizeForList(report: AuditReport): ListSummary {
  const { reachable, areas } = summarizeForProspect(report);
  if (!reachable) return { status: PROSPECTS.unreachable, lights: [], dotsLabel: null };

  const lights = areas.map((a) => a.light);
  const count = (light: Light) => lights.filter((l) => l === light).length;
  const [red, amber, green] = [count("red"), count("amber"), count("green")];
  const status = red > 0 ? PROSPECTS.fixFirst(red) : amber > 0 ? PROSPECTS.needsWork(amber) : PROSPECTS.good;
  return { status, lights, dotsLabel: PROSPECTS.dots(red, amber, green) };
}
