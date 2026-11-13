/**
 * What can be done about each check's findings, fixed here and never decided by a model.
 *
 * `fixableInCode` is true when a change to the site's code or content fixes it (a title, a sitemap
 * file, a link). It is false when a person has to act in DNS, hosting or storage settings, or the site
 * itself is down; those findings show "Needs you" with the one line below, and get no Fix button.
 */
export type CheckInfo = { fixableInCode: true } | { fixableInCode: false; needsYou: string };

export const CHECK_CATALOG = {
  "page.title": { fixableInCode: true },
  "page.description": { fixableInCode: true },
  "page.h1": { fixableInCode: true },
  "page.lang": { fixableInCode: true },
  "page.viewport": { fixableInCode: true },
  "page.canonical": { fixableInCode: true },
  "page.open-graph": { fixableInCode: true },
  "page.image-alt": { fixableInCode: true },
  "page.json-ld": { fixableInCode: true },
  "page.broken-link": { fixableInCode: true },
  "site.sitemap": { fixableInCode: true },
  "site.robots": { fixableInCode: true },
  "page.slow": { fixableInCode: false, needsYou: "Ask your web host or site builder to make the server answer faster." },
  "site.https": { fixableInCode: false, needsYou: "Turn on HTTPS, and the redirect from http, in your hosting settings." },
  "site.security-headers": { fixableInCode: false, needsYou: "Add the missing security headers in your hosting settings." },
  "site.www": { fixableInCode: false, needsYou: "Choose one address and redirect the other in your DNS or hosting settings." },
  "site.redirects": { fixableInCode: false, needsYou: "Fix the redirect in your DNS or hosting settings." },
  "site.unreachable": { fixableInCode: false, needsYou: "Check that the site is up and not blocking automated visitors, then audit it again." },
  "site.start": { fixableInCode: false, needsYou: "Find out why the homepage isn't loading; look at your hosting first." },
  "page.unreachable": { fixableInCode: false, needsYou: "Check that the page is up; it may be a hosting problem." },
} as const satisfies Record<string, CheckInfo>;

export type CheckId = keyof typeof CHECK_CATALOG;

/** A check this version doesn't know (an older or newer report) is left to a person, never sent to a run. */
const UNKNOWN_CHECK: CheckInfo = { fixableInCode: false, needsYou: "This one needs a person to look at it." };

export function checkInfo(check: string): CheckInfo {
  return Object.hasOwn(CHECK_CATALOG, check) ? CHECK_CATALOG[check as CheckId] : UNKNOWN_CHECK;
}
