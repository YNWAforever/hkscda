import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

describe("public visual token boundary", () => {
  test("wraps public routes without changing the admin shell", () => {
    const root = readFileSync(join(process.cwd(), "src/routes/__root.tsx"), "utf8");
    const publicShell = readFileSync(
      join(process.cwd(), "src/components/site/PublicSiteShell.tsx"),
      "utf8",
    );

    expect(root).toContain('import("../components/site/PublicSiteShell")');
    expect(root).toContain('className="admin-shell min-h-dvh"');
    expect(publicShell).toContain('className="site-shell min-h-dvh"');
    expect(publicShell.indexOf('className="site-shell min-h-dvh"')).toBeLessThan(
      publicShell.indexOf("<Header />"),
    );
  });

  test("places the root not-found state inside the page main landmark", () => {
    const root = readFileSync(join(process.cwd(), "src/routes/__root.tsx"), "utf8");
    expect(root).toMatch(/function NotFoundComponent[\s\S]*return \(\s*<main>/);
  });
});
