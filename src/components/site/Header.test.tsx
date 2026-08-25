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

describe("Header dropdown positioning", () => {
  test("anchors dropdown content to its navigation item", () => {
    const header = source();
    expect(header).toMatch(
      /<NavigationMenu\.Item className="relative">\s*<NavigationMenu\.Trigger/,
    );
  });

  test("keeps the Stage A public header treatment scoped to the public shell", () => {
    const header = source();
    expect(header).toContain('className="public-site-header"');
    expect(header).toContain("public-nav-dropdown");
    expect(header).toContain("public-mobile-nav");
  });
});
