import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const source = () => readFileSync(join(process.cwd(), "src/components/site/Header.tsx"), "utf8");

describe("Header navigation", () => {
  test("includes knowledge in both desktop and mobile public information navigation", () => {
    const header = source();
    expect(header).toContain('to: "/knowledge"');
    expect(header.match(/links=\{aboutLinks\}/g)).toHaveLength(2);
  });

  test("keeps group volunteering contextual on desktop and mobile", () => {
    const header = source();
    expect(header).toContain('to: "/volunteer/group"');
    expect(header.match(/links=\{volunteerLinks\}/g)).toHaveLength(2);
  });
});
