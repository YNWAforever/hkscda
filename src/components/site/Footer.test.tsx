import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

describe("Footer navigation", () => {
  test("links visitors to the knowledge hub and group volunteering", () => {
    const footer = readFileSync(join(process.cwd(), "src/components/site/Footer.tsx"), "utf8");
    expect(footer).toContain('href="/knowledge"');
    expect(footer).toContain('href="/volunteer/group"');
  });
});
