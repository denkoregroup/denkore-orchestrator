/**
 * @jest-environment node
 *
 * Guards the Night Harbor palette (#55): dark only, the named colors, and light cards that stay
 * light on screen and white when printed.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const css = readFileSync(path.join(process.cwd(), "app", "globals.css"), "utf8");
const block = (selector: string) => {
  const start = css.indexOf(`${selector} {`);
  return css.slice(start, css.indexOf("}", start));
};

describe("Night Harbor theme", () => {
  it("is dark only, with no light palette switched in by the system setting", () => {
    expect(css).not.toContain("prefers-color-scheme");
    const root = block(":root");
    expect(root).toContain("color-scheme: dark");
    for (const token of ["--background: #0d0f12", "--foreground: #f4f3ef", "--border: #2a2f36", "--accent: #c59b27", "--signal: #4fd1c5", "--abyss: #0f4c5c"]) {
      expect(root).toContain(token);
    }
  });

  it("makes cards alabaster with dark text, 14px corners and no glow", () => {
    const card = block(".surface-card");
    expect(card).toContain("--background: #f4f3ef");
    expect(card).toContain("--foreground: #0d0f12");
    expect(card).toContain("border-radius: 14px");
    expect(card).not.toMatch(/shadow|gradient/);
  });

  it("prints on white, without the glow", () => {
    const print = css.slice(css.indexOf("@media print"));
    expect(print).toMatch(/:root,\s*\.surface-card \{[^}]*--background: #ffffff/);
    expect(print).toMatch(/\.harbor-header \{\s*background: none;/);
  });
});
