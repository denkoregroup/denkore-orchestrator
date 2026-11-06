/**
 * Pulls the facts the checks need out of an HTML page, once, with parse5.
 * Checks never see raw HTML, only PageFacts.
 */
import { parse } from "parse5";

export interface ImageFact {
  src: string;
  /** null when the alt attribute is missing; "" for a decorative image (valid). */
  alt: string | null;
}

export interface PageFacts {
  /** Text of the first <title>, trimmed and whitespace-collapsed; null if absent. */
  title: string | null;
  /** content of <meta name="description">; null if absent. */
  metaDescription: string | null;
  h1Count: number;
  /** lang attribute of <html>; null if absent or blank. */
  lang: string | null;
  /** content of <meta name="viewport">; null if absent. */
  viewport: string | null;
  /** href of <link rel="canonical">, as written; null if absent. */
  canonical: string | null;
  /** Open Graph values by property (og:title, og:description, og:image). */
  openGraph: Record<string, string>;
  images: ImageFact[];
  /** Raw text of each <script type="application/ld+json">, in order. */
  jsonLd: string[];
  /** href of every <a>, as written, in document order. */
  links: string[];
}

interface Node {
  nodeName: string;
  tagName?: string;
  attrs?: Array<{ name: string; value: string }>;
  childNodes?: Node[];
  content?: Node; // <template>
  value?: string; // text nodes
}

function attr(node: Node, name: string): string | null {
  return node.attrs?.find((a) => a.name === name)?.value ?? null;
}

function textOf(node: Node): string {
  if (node.nodeName === "#text") return node.value ?? "";
  return (node.childNodes ?? []).map(textOf).join("");
}

function walk(node: Node, visit: (node: Node) => void): void {
  visit(node);
  for (const child of node.childNodes ?? []) walk(child, visit);
}

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

export function extractFacts(html: string): PageFacts {
  const document = parse(html) as unknown as Node;
  const facts: PageFacts = {
    title: null,
    metaDescription: null,
    h1Count: 0,
    lang: null,
    viewport: null,
    canonical: null,
    openGraph: {},
    images: [],
    jsonLd: [],
    links: [],
  };

  walk(document, (node) => {
    switch (node.tagName) {
      case "html": {
        const lang = attr(node, "lang")?.trim();
        if (lang) facts.lang = lang;
        break;
      }
      case "title":
        if (facts.title === null) facts.title = collapse(textOf(node));
        break;
      case "meta": {
        const name = attr(node, "name")?.toLowerCase();
        const property = attr(node, "property")?.toLowerCase();
        const content = attr(node, "content");
        if (content === null) break;
        if (name === "description" && facts.metaDescription === null) facts.metaDescription = collapse(content);
        if (name === "viewport" && facts.viewport === null) facts.viewport = content.trim();
        if (property?.startsWith("og:") && !(property in facts.openGraph)) facts.openGraph[property] = content.trim();
        break;
      }
      case "link": {
        const rel = (attr(node, "rel") ?? "").toLowerCase().split(/\s+/);
        const href = attr(node, "href");
        if (rel.includes("canonical") && href !== null && facts.canonical === null) facts.canonical = href.trim();
        break;
      }
      case "h1":
        facts.h1Count++;
        break;
      case "img": {
        const src = attr(node, "src") ?? attr(node, "data-src") ?? "";
        facts.images.push({ src: src.trim(), alt: attr(node, "alt") });
        break;
      }
      case "script":
        if ((attr(node, "type") ?? "").trim().toLowerCase() === "application/ld+json") facts.jsonLd.push(textOf(node));
        break;
      case "a": {
        const href = attr(node, "href");
        if (href !== null) facts.links.push(href.trim());
        break;
      }
    }
  });
  return facts;
}
