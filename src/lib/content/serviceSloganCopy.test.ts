import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, test } from "bun:test";

const obsoleteServiceSlogan = "?亙???????";
const correctedServiceSlogan = "?祆?隞仿?蝝撘脰??舀???拇???銝阡? 24 撠??嗅潦";
const migrationPath = join(process.cwd(), "supabase/migrations/20260718122000_correct_service_slogan.sql");

function trackedContentFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return trackedContentFiles(path);
    if (relative(process.cwd(), path).replaceAll("\\", "/") === "src/lib/content/serviceSloganCopy.test.ts") return [];
    if (path === migrationPath) return [];
    return [path];
  });
}

describe("service slogan correction", () => {
  test("uses the approved replacement for the exact obsolete slogan without touching unrelated 24-hour content", () => {
    expect(existsSync(migrationPath)).toBe(true);
    if (!existsSync(migrationPath)) return;

    const migration = readFileSync(migrationPath, "utf8");
    expect(migration).toContain(obsoleteServiceSlogan);
    expect(migration).toContain(correctedServiceSlogan);
    expect(migration).toContain("update public.content_item");
    expect(migration).toContain("select id, slug, title");

    const obsoleteFiles = ["src", "supabase", "public"]
      .flatMap((directory) => trackedContentFiles(join(process.cwd(), directory)))
      .filter((filePath) => readFileSync(filePath, "utf8").includes(obsoleteServiceSlogan));
    expect(obsoleteFiles).toEqual([]);
  });

  test("publishes volunteer group and knowledge routes while retaining the audit report", () => {
    const sitemap = readFileSync(join(process.cwd(), "public/sitemap.xml"), "utf8");
    expect(sitemap).toContain("https://hkscda.com/knowledge");
    expect(sitemap).toContain("https://hkscda.com/volunteer/group");
    expect(sitemap).toContain("https://hkscda.com/report/audit");
  });
});
