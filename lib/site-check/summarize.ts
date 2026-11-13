import type { AuditReport, Finding } from "@/lib/audits/types";
import { normalizeUrl } from "@/lib/audits/types";
import { AREA_COPY, FIXES, HEADLINES, STATUS_WORDS, SUPPORTING, UNREACHABLE } from "./copy";

export type Light = "red" | "amber" | "green";
export type AreaId = "sharing" | "google" | "speed" | "safety";
export type FixCheck = keyof typeof FIXES;

export interface Area {
  id: AreaId;
  title: string;
  light: Light;
  status: (typeof STATUS_WORDS)[Light];
  why: string;
}

export interface ProspectSummary {
  /** False when the homepage could not be loaded: there are then no areas and no fixes. */
  reachable: boolean;
  /** before + light + after is the headline; `light` is set in the light weight. */
  headline: { before: string; light: string; after: string };
  supporting: string;
  /** Four areas in a fixed order, or none when unreachable. */
  areas: Area[];
  /** At most three, most important first. */
  topFixes: Array<{ title: string; outcome: string }>;
  totalFindings: number;
}

/** Which checks feed each area (ids as in lib/audits/checks). */
export const AREA_CHECKS: Record<AreaId, readonly string[]> = {
  sharing: ["page.open-graph"],
  google: [
    "page.title",
    "page.description",
    "page.canonical",
    "page.json-ld",
    "page.lang",
    "page.viewport",
    "page.image-alt",
    "page.broken-link",
    "site.sitemap",
    "site.robots",
    "site.www",
    "site.redirects",
  ],
  speed: ["page.slow"],
  safety: ["site.https", "site.security-headers"],
};

const AREA_ORDER: readonly AreaId[] = ["sharing", "google", "speed", "safety"];

/** After the light, fixes are ordered by this. */
export const FIX_PRIORITY: readonly FixCheck[] = [
  "page.open-graph",
  "site.https",
  "site.sitemap",
  "page.description",
  "page.title",
  "page.viewport",
  "page.slow",
  "page.canonical",
  "page.broken-link",
  "site.robots",
  "page.image-alt",
  "page.json-ld",
  "page.lang",
  "site.www",
  "site.redirects",
];

/** The auditor writes one page.open-graph finding per missing tag (og:title, og:description, og:image). */
const OPEN_GRAPH_TAGS = 3;
const TOP_FIXES = 3;

const LIGHT_RANK: Record<Light, number> = { red: 0, amber: 1, green: 2 };

/**
 * What a prospect sees about a site, decided by fixed rules and fixed copy (copy.ts), never a model.
 * Nothing from the audited site's own text is passed through: every word returned is from copy.ts.
 */
export function summarizeForProspect(report: AuditReport): ProspectSummary {
  const totalFindings = report.findings.length;
  if (report.findings.some((f) => f.check === "site.unreachable")) {
    return { reachable: false, headline: UNREACHABLE.headline, supporting: UNREACHABLE.supporting, areas: [], topFixes: [], totalFindings };
  }

  const inArea = (id: AreaId) => report.findings.filter((f) => AREA_CHECKS[id].includes(f.check));
  const sharing = inArea("sharing");
  const google = inArea("google");
  const speed = inArea("speed");
  const safetyFindings = inArea("safety");

  // The homepage is the page the audit started from, whose address is the report's target.
  const homepage = normalizeUrl(report.target);
  const sharingAllMissing = sharing.filter((f) => normalizeUrl(f.url) === homepage).length >= OPEN_GRAPH_TAGS;
  const count = (list: Finding[], severity: Finding["severity"]) => list.filter((f) => f.severity === severity).length;

  const lights: Record<AreaId, Light> = {
    sharing: sharingAllMissing ? "red" : sharing.length > 0 ? "amber" : "green",
    google: count(google, "fail") > 0 ? "red" : count(google, "warn") > 0 || count(google, "info") >= 2 ? "amber" : "green",
    speed: speed.some((f) => f.severity !== "info") ? "red" : speed.length > 0 ? "amber" : "green",
    safety: safetyFindings.some((f) => f.check === "site.https") ? "red" : "green",
  };

  const optionalSettings = safetyFindings.length > 0; // only site.security-headers can be left when safety is green
  const whys: Record<AreaId, string> = {
    sharing: AREA_COPY.sharing.why[lights.sharing],
    google: AREA_COPY.google.why[lights.google],
    speed: AREA_COPY.speed.why[lights.speed],
    safety:
      lights.safety === "red"
        ? AREA_COPY.safety.why.red
        : optionalSettings
          ? AREA_COPY.safety.why.greenWithOptionalSettings
          : AREA_COPY.safety.why.green,
  };

  const areas: Area[] = AREA_ORDER.map((id) => ({
    id,
    title: AREA_COPY[id].title,
    light: lights[id],
    status: STATUS_WORDS[lights[id]],
    why: whys[id],
  }));

  return {
    reachable: true,
    headline: headlineFor(lights),
    supporting: supportingFor(lights, sharingAllMissing),
    areas,
    topFixes: topFixesFor(report.findings, lights),
    totalFindings,
  };
}

function headlineFor(lights: Record<AreaId, Light>): ProspectSummary["headline"] {
  if (lights.safety === "red") return HEADLINES.notSecure;
  if (lights.google === "red") return HEADLINES.hardToFind;
  if (lights.sharing === "red") return HEADLINES.invisibleWhenShared;
  if (lights.speed === "red") return HEADLINES.slow;
  if (Object.values(lights).includes("amber")) return HEADLINES.easyWins;
  return HEADLINES.goodShape;
}

function supportingFor(lights: Record<AreaId, Light>, sharingAllMissing: boolean): string {
  const { phrases } = SUPPORTING;
  // Safety has no phrase: its problem is the headline's, and it is never amber.
  const candidates: Array<string | null> = [
    lights.sharing !== "green" ? (sharingAllMissing ? phrases.sharingAllMissing : phrases.sharingPartlyMissing) : null,
    lights.google !== "green" ? phrases.google : null,
    lights.speed !== "green" ? phrases.speed : null,
  ];
  const problems = candidates.filter((p): p is string => p !== null);

  const first = `${SUPPORTING.loads}${lights.safety === "green" ? SUPPORTING.secure : ""}${SUPPORTING.end}`;
  if (problems.length === 0) return first;
  const joined = problems.length === 1 ? problems[0] : `${problems.slice(0, -1).join(", ")} and ${problems[problems.length - 1]}`;
  return `${first}${SUPPORTING.but}${joined}${SUPPORTING.end}`;
}

/**
 * One fix per distinct check that has a finding in a red or amber area: red areas first, then amber,
 * then by FIX_PRIORITY. site.security-headers is in no priority list, so it never appears.
 */
function topFixesFor(findings: Finding[], lights: Record<AreaId, Light>): ProspectSummary["topFixes"] {
  const lightOfCheck = new Map<string, Light>();
  for (const id of AREA_ORDER) for (const check of AREA_CHECKS[id]) lightOfCheck.set(check, lights[id]);

  const present = new Set(findings.map((f) => f.check));
  return FIX_PRIORITY.filter((check) => present.has(check) && lightOfCheck.get(check) !== "green")
    .map((check, priority) => ({ check, priority, rank: LIGHT_RANK[lightOfCheck.get(check)!] }))
    .sort((a, b) => a.rank - b.rank || a.priority - b.priority)
    .slice(0, TOP_FIXES)
    .map(({ check }) => FIXES[check]);
}
