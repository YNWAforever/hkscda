import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

describe("public visual token boundary", () => {
  test("wraps public routes without changing the admin shell", () => {
    const root = readFileSync(join(process.cwd(), "src/routes/__root.tsx"), "utf8");

    expect(root).toContain('className="site-shell min-h-dvh"');
    expect(root).toContain('className="admin-shell min-h-dvh"');
    expect(root.indexOf('className="site-shell min-h-dvh"')).toBeLessThan(
      root.indexOf("<Header />"),
    );
  });
});
