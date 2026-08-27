import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const robots = () => read("src/routes/robots[.]txt.ts");
const sitemap = () => read("src/routes/sitemap[.]xml.ts");

/**
 * Defect G-21. The dynamic robots and sitemap routes were added while
 * public/robots.txt and public/sitemap.xml were left in place. The Vercel output
 * config resolves "handle: filesystem" before the /__server catch-all, so on
 * Vercel the static files answered both URLs and the dynamic routes never ran.
 * They must not come back.
 */
describe("SEO surfaces are served by the routes, not shadowed by static files", () => {
  test("no static file shadows a dynamic SEO route", () => {
    expect(existsSync(join(process.cwd(), "public/robots.txt"))).toBe(false);
    expect(existsSync(join(process.cwd(), "public/sitemap.xml"))).toBe(false);
  });

  test("robots keeps the application form out of the index", () => {
    // Decision D-8 default. The static file carried this rule; the dynamic route
    // that replaced it did not, so deleting the static file without restoring it
    // would have newly exposed the form to crawlers.
    expect(robots()).toContain("Disallow: /adoption/apply");
  });

  test("robots keeps admin and capability-token paths out of the index", () => {
    const source = robots();
    for (const path of [
      "Disallow: /admin/",
      "Disallow: /api/",
      "Disallow: /adoption/status/",
      "Disallow: /sponsors/status/",
      "Disallow: /volunteer/status/",
    ]) {
      expect(source).toContain(path);
    }
  });

  test("the sitemap advertises no form, token, admin or API path", () => {
    const source = sitemap();
    expect(source).not.toContain("/adoption/apply");
    expect(source).not.toContain("/status/");
    expect(source).not.toContain("/admin");
    expect(source).not.toContain("/api/");
  });
});
