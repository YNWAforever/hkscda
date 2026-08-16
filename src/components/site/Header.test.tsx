import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

const headerSource = readFileSync(new URL("./Header.tsx", import.meta.url), "utf8");

describe("Header dropdown positioning", () => {
  test("anchors dropdown content to its navigation item", () => {
    expect(headerSource).toMatch(
      /<NavigationMenu\.Item className="relative">\s*<NavigationMenu\.Trigger/,
    );
  });
});
