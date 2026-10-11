import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

/**
 * The public focus ring must stand out at 3:1 from what it sits on (WCAG 1.4.11).
 * It sits outside the control, on the surrounding surface, so it is checked
 * against every public surface token, and its inverse against the dark bands.
 * This reads the tokens rather than trusting the comment beside them.
 */
const css = readFileSync(join(import.meta.dir, "..", "styles.css"), "utf8");

function block(selector: string): string {
  const start = css.indexOf(`\n${selector} {`);
  if (start === -1) throw new Error(`no ${selector} block`);
  return css.slice(start, css.indexOf("\n}", start));
}

const scopes = [block("@theme"), block(".site-shell")];

function token(name: string): string {
  // The public scope overrides the theme, so it is read last and wins.
  let value: string | undefined;
  for (const scope of scopes) {
    const match = scope.match(new RegExp(`\\s${name}:\\s*([^;]+);`));
    if (match) value = match[1].trim();
  }
  if (!value) throw new Error(`no ${name}`);
  const reference = value.match(/^var\((--[\w-]+)\)$/);
  return reference ? token(reference[1]) : value;
}

function luminance(hex: string): number {
  const channels = hex
    .replace("#", "")
    .match(/../g)!
    .map((pair) => {
      const v = parseInt(pair, 16) / 255;
      return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("public focus ring", () => {
  test.each([
    "--color-bg",
    "--color-surface",
    "--color-surface-offset",
    "--color-footer-bg",
    "--color-primary-highlight",
    "--color-secondary-highlight",
  ])("clears 3:1 on %s", (surface) => {
    expect(contrast(token("--public-focus-ring"), token(surface))).toBeGreaterThanOrEqual(3);
  });

  test.each(["--color-panel", "--color-panel-2", "--color-primary-hover", "--color-text"])(
    "the inverse ring clears 3:1 on %s",
    (surface) => {
      expect(contrast(token("--public-focus-ring-inverse"), token(surface))).toBeGreaterThanOrEqual(
        3,
      );
    },
  );
});
