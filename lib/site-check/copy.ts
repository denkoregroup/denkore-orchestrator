/**
 * Every word a prospect reads in the site check, in one place. Edit the wording here; the rules that
 * decide which line shows live in summarize.ts. Plain words, "you" and "your", no jargon.
 */

export const STATUS_WORDS = { red: "Fix first", amber: "Needs work", green: "Good" } as const;

export const AREA_COPY = {
  sharing: {
    title: "Looks right when shared",
    why: {
      red: "Shared links show up as a blank box.",
      amber: "Shared links are missing a picture, a name or a line about you.",
      green: "Shared links show your picture, your name and a line about you.",
    },
  },
  google: {
    title: "Found on Google",
    why: {
      red: "Something Google needs is broken or missing.",
      amber: "Google is missing a few details about your site.",
      green: "Google has what it needs to find and list your site.",
    },
  },
  speed: {
    title: "Speed",
    why: {
      red: "Your pages are very slow to start loading.",
      amber: "Your pages are a little slow to start loading.",
      green: "Your pages start loading quickly.",
    },
  },
  // Red: the site is not secure. Amber: it is, but the plain address doesn't always reach it. The
  // optional line shows when only the optional settings are missing.
  safety: {
    title: "Safety",
    why: {
      red: "Browsers show your visitors a “Not secure” warning.",
      amber: "Your site is secure, but typing your address without “https://” doesn't always reach it.",
      green: "Your site uses a secure connection.",
      greenWithOptionalSettings: "Your site uses a secure connection. A few optional settings could make it safer still.",
    },
  },
} as const;

/** The headline is `before` + `light` + `after`; the middle words are set in the light weight. */
export const HEADLINES = {
  notSecure: { before: "Your site shows as ", light: "not secure", after: "." },
  hardToFind: { before: "Solid site, ", light: "hard to find", after: " on Google." },
  invisibleWhenShared: { before: "Solid site, ", light: "invisible", after: " when shared." },
  slow: { before: "Solid site, ", light: "slow", after: " to open." },
  easyWins: { before: "Good site, a few ", light: "easy wins", after: "." },
  goodShape: { before: "Your site is in ", light: "good shape", after: "." },
} as const;

/** The whole headline is one plain sentence with no light-weight words. */
export const UNREACHABLE = {
  headline: { before: "We couldn't load your site.", light: "", after: "" },
  supporting: "The site didn't load when we checked. It may be down, or blocking automated visitors.",
} as const;

export const SUPPORTING = {
  loads: "It loads",
  secure: ", and it's secure",
  end: ".",
  but: " But ",
  phrases: {
    sharingAllMissing: "shared links show up blank",
    sharingPartlyMissing: "shared links are missing details",
    google: "Google is missing a few details",
    speed: "it's slow to start loading",
    safetyAmber: "typing your plain address doesn't always reach it",
  },
} as const;

/** What to fix, by check. site.security-headers is not here: it never appears in the top three. */
export const FIXES = {
  "page.open-graph": {
    title: "Add link previews",
    outcome: "Shared links show your picture, name and a line about you instead of a blank box.",
  },
  "site.https": {
    title: "Send every visitor to the secure version of your site",
    outcome: "No one lands on an insecure page or sees a “Not secure” warning.",
  },
  "site.sitemap": {
    title: "Give Google a map of your site",
    outcome: "A sitemap helps Google find every page you add, not just the homepage.",
  },
  "page.description": {
    title: "Fix your search description",
    outcome: "It's the line Google shows under your name, so it should say what you do in 160 characters or fewer.",
  },
  "page.title": {
    title: "Give every page a clear title",
    outcome: "Your pages show up in search results under a name people understand.",
  },
  "page.viewport": {
    title: "Make your pages work on phones",
    outcome: "Visitors on a phone see a page they can read, not a tiny copy of the desktop one.",
  },
  "page.slow": {
    title: "Make your pages open faster",
    outcome: "Visitors see your page sooner, so fewer of them give up and leave.",
  },
  "page.canonical": {
    title: "Tell Google which address is the real one",
    outcome: "Google counts all your visits in one place instead of splitting them between copies of a page.",
  },
  "page.broken-link": {
    title: "Fix the links that go nowhere",
    outcome: "Visitors stop landing on error pages, and Google stops hitting dead ends.",
  },
  "site.robots": {
    title: "Add a guide for search engines",
    outcome: "Search engines know which parts of your site to look at, and where your sitemap is.",
  },
  "page.image-alt": {
    title: "Describe your pictures",
    outcome: "People who use screen readers, and Google, can tell what your pictures show.",
  },
  "page.json-ld": {
    title: "Add details Google can read",
    outcome: "Google can show facts about your business, like your hours, right in search results.",
  },
  "page.lang": {
    title: "Say what language your pages are in",
    outcome: "Screen readers and translation tools read your pages correctly.",
  },
  "site.www": {
    title: "Pick one address for your site",
    outcome: "Visitors and Google see one site, not two copies, with and without the www.",
  },
  "site.redirects": {
    title: "Send old addresses to the right page",
    outcome: "Anyone who uses an old or alternate address ends up where you want them.",
  },
} as const;

/** Where "Book a call" goes, and what the QR code on the page and the PDF opens. Empty leaves both out. */
export const BOOKING_URL = "https://cal.com/dcps302";

/** The words around the report on the phone screen and in the PDF. */
export const VIEW = {
  eyebrow: "Site check",
  atAGlance: "At a glance",
  fixesHeading: (count: number): string => (count === 1 ? "The fix that matters most" : count === 2 ? "Two fixes that matter most" : "Three fixes that matter most"),
  helpHeading: "How Denkore can help",
  helpLine: (count: number): string =>
    count === 1 ? "It's a quick fix. We can have it done soon." : count === 2 ? "Both are quick fixes. We can have them done soon." : "All three are quick fixes. We can have them done soon.",
  bookCall: "Book a call",
  qrLabel: "QR code to book a call",
  savePdf: "Save as PDF",
  allFindings: (count: number): string => `See all ${count} ${count === 1 ? "finding" : "findings"}`,
  checkedHomepage: "homepage",
  checkedPages: (count: number): string => `${count} pages`,
  checked: "Checked",
  findingsOnRequest: (count: number): string => `${count} ${count === 1 ? "finding" : "findings"} in full on request`,
  signature: "Site check by Denkore · Tech that's not confusing.",
  back: "All sites",
  backProspects: "All prospects",
} as const;

/** The quick-check form on the Prospects page. */
export const CHECK_FORM = {
  label: "Their website",
  placeholder: "theirbusiness.com",
  hint: "Takes about 15 seconds. Looks at the homepage only.",
  button: "Check site",
  pending: "Checking…",
  failed: "We couldn't check that site. Check the address and try again.",
} as const;

/** The Prospects page: its tabs, and one line per recent check. */
export const PROSPECTS = {
  tabSites: "Your sites",
  tabProspects: "Prospects",
  heading: "Prospects",
  intro: "Type a business's website to see how it looks to a customer. Every check is kept here.",
  recent: "Recent checks",
  empty: "No checks yet. Type a website above to run one.",
  unreachable: "couldn't load",
  fixFirst: (count: number): string => `${count} to fix first`,
  needsWork: (count: number): string => `${count} to work on`,
  good: "looking good",
  /** What the four small dots say, for a screen reader: how many areas are in each light. */
  dots: (red: number, amber: number, green: number): string => `${red} ${STATUS_WORDS.red.toLowerCase()}, ${amber} ${STATUS_WORDS.amber.toLowerCase()}, ${green} ${STATUS_WORDS.green.toLowerCase()}`,
} as const;
