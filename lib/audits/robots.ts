/** A small robots.txt reader: groups, Allow/Disallow with * and $, and Sitemap lines. */

interface Rule {
  allow: boolean;
  pattern: string;
}

export interface Robots {
  groups: Array<{ agents: string[]; rules: Rule[] }>;
  sitemaps: string[];
}

export function parseRobots(text: string): Robots {
  const robots: Robots = { groups: [], sitemaps: [] };
  let current: { agents: string[]; rules: Rule[] } | null = null;
  let lastWasAgent = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    const match = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
    if (!match) continue;
    const field = match[1].toLowerCase();
    const value = match[2].trim();
    if (field === "sitemap") {
      if (value) robots.sitemaps.push(value);
      continue;
    }
    if (field === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        robots.groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (field === "allow" || field === "disallow") {
      // An empty Disallow allows everything; skip it.
      if (value) current.rules.push({ allow: field === "allow", pattern: value });
    }
  }
  return robots;
}

function rulesFor(robots: Robots, agent: string): Rule[] {
  const token = agent.toLowerCase();
  const specific = robots.groups.filter((g) => g.agents.some((a) => a !== "*" && token.includes(a)));
  const chosen = specific.length > 0 ? specific : robots.groups.filter((g) => g.agents.includes("*"));
  return chosen.flatMap((g) => g.rules);
}

function matches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const regex = new RegExp(`^${body.split("*").map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*")}${anchored ? "$" : ""}`);
  return regex.test(path);
}

/** Longest matching rule wins; Allow wins a tie. No matching rule means allowed. */
export function isAllowed(robots: Robots, agent: string, path: string): boolean {
  let best: Rule | null = null;
  for (const rule of rulesFor(robots, agent)) {
    if (!matches(rule.pattern, path)) continue;
    if (!best || rule.pattern.length > best.pattern.length || (rule.pattern.length === best.pattern.length && rule.allow)) {
      best = rule;
    }
  }
  return best ? best.allow : true;
}
