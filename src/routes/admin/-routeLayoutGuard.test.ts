import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Every admin page must render inside AdminLayout (or VolunteerAdminShell, or the
// AdminLanguageProvider the sign-in pages mount itself): admin components read the
// language from that provider and throw without it. The /admin/content parent renders
// a bare <Outlet /> for its children, so each child route must wrap itself.
const ROOT = join(process.cwd(), "src/routes/admin");
const WRAPS = /\b(?:AdminLayout|VolunteerAdminShell|AdminLanguageProvider)\b/;

// Children of a layout route that already puts its <Outlet /> inside AdminLayout.
const PARENT_WRAPPED: Record<string, string> = {
  "applications/$id.tsx": "applications.tsx",
  "applications/index.tsx": "applications.tsx",
};

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return routeFiles(path);
    if (!name.endsWith(".tsx") || name.startsWith("-") || name.includes(".test.")) return [];
    return [path];
  });
}

const relativePath = (path: string) => relative(ROOT, path).split("\\").join("/");
const read = (path: string) => readFileSync(path, "utf8");

describe("admin route layout guard", () => {
  const files = routeFiles(ROOT);

  test("scans the admin route tree", () => {
    expect(files.length).toBeGreaterThan(30);
  });

  test("every admin route that renders a page wraps it in the admin layout", () => {
    const unwrapped = files
      .filter((file) => {
        const source = read(file);
        return /\bcomponent\s*:/.test(source) && !WRAPS.test(source);
      })
      .map(relativePath)
      .sort();
    expect(unwrapped).toEqual(Object.keys(PARENT_WRAPPED).sort());
  });

  test("each parent-wrapped route's parent puts its <Outlet /> inside AdminLayout", () => {
    for (const parent of new Set(Object.values(PARENT_WRAPPED))) {
      expect(read(join(ROOT, parent))).toMatch(
        /<AdminLayout\b[\s\S]*<Outlet\s*\/>[\s\S]*<\/AdminLayout>/,
      );
    }
  });
});
