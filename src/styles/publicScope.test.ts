import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

/**
 * WP-1 step 7. The ported design system styles bare element selectors - html,
 * body, a, img, h1-h3 - because in its source it was the whole document. Here it
 * shares a bundle with the admin surface, so every rule has to stay inside
 * .site-shell. This parses the stylesheet rather than trusting the port.
 */
function topLevelRules(css: string): string[] {
  const selectors: string[] = [];
  let depth = 0;
  let buffer = "";

  for (let i = 0; i < css.length; i += 1) {
    const ch = css[i];
    if (ch === "{") {
      if (depth === 0) selectors.push(buffer.trim());
      depth += 1;
      buffer = "";
    } else if (ch === "}") {
      depth -= 1;
      buffer = "";
    } else if (depth === 0) {
      buffer += ch;
    }
  }
  return selectors.filter(Boolean);
}

function stripComments(css: string): string {
  let out = "";
  let i = 0;
  const OPEN = "/" + "*";
  const CLOSE = "*" + "/";
  while (i < css.length) {
    const open = css.indexOf(OPEN, i);
    if (open === -1) {
      out += css.slice(i);
      break;
    }
    out += css.slice(i, open);
    const close = css.indexOf(CLOSE, open + 2);
    if (close === -1) break;
    i = close + 2;
  }
  return out;
}

describe("public design system stays inside the public shell", () => {
  const css = stripComments(readFileSync(join(process.cwd(), "src/styles/public.css"), "utf8"));

  test("has content to check", () => {
    expect(css.length).toBeGreaterThan(10_000);
  });

  test("every top-level rule is scoped or an at-rule that cannot be", () => {
    const offenders = topLevelRules(css).filter((selector) => {
      if (selector.startsWith("@keyframes") || selector.startsWith("@font-face")) return false;
      return !selector.startsWith(".site-shell");
    });

    // Anything here would apply to /admin as well as the public site.
    expect(offenders).toEqual([]);
  });

  test("declares no bare element selector at the top level", () => {
    for (const selector of topLevelRules(css)) {
      expect(selector.startsWith("html") || selector.startsWith("body")).toBe(false);
    }
  });
});
