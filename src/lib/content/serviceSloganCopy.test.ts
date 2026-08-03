import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, test } from "bun:test";

const obsoleteServiceSlogan = "日夜堅守前線動物救援";
const correctedServiceSlogan = "本會以預約方式進行拯救與援助服務，並非 24 小時當值。";
const migrationPath = join(
  process.cwd(),
  "supabase/migrations/20260718122000_correct_service_slogan.sql",
);

const excludedAuditPaths = new Set([
  "src/lib/content/serviceSloganCopy.test.ts",
  "supabase/migrations/20260718122000_correct_service_slogan.sql",
]);

function isPlanOrSpecDocumentation(repositoryPath: string): boolean {
  return (
    repositoryPath.startsWith(".superpowers/sdd/") ||
    /(?:^|\/)(?:plans?|specs?)(?:\/|$)|(?:^|\/)[^/]*(?:plan|spec)[^/]*\.(?:md|mdx|txt)$/i.test(
      repositoryPath,
    )
  );
}

function trackedContentFiles(): string[] {
  return execFileSync("git", ["ls-files", "-z"], { cwd: process.cwd(), encoding: "utf8" })
    .split("\0")
    .filter((repositoryPath) => repositoryPath.length > 0)
    .filter((repositoryPath) => !excludedAuditPaths.has(repositoryPath))
    .filter((repositoryPath) => !isPlanOrSpecDocumentation(repositoryPath))
    .map((repositoryPath) => join(process.cwd(), repositoryPath));
}

function readTrackedTextFile(filePath: string): string {
  const contents = readFileSync(filePath);
  return contents.includes(0) ? "" : contents.toString("utf8");
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

    const auditFilePaths = trackedContentFiles();
    expect(
      auditFilePaths.map((filePath) => relative(process.cwd(), filePath).replaceAll("\\", "/")),
    ).toEqual(
      expect.arrayContaining(["scripts/seed-admin.js", "vite.config.ts", "eslint.config.js"]),
    );

    const obsoleteFiles = auditFilePaths.filter((filePath) =>
      readTrackedTextFile(filePath).includes(obsoleteServiceSlogan),
    );
    expect(obsoleteFiles).toEqual([]);
  });

  test("publishes volunteer group and knowledge routes while retaining the audit report", () => {
    const sitemap = readFileSync(join(process.cwd(), "public/sitemap.xml"), "utf8");
    expect(sitemap).toContain("https://hkscda.com/knowledge");
    expect(sitemap).toContain("https://hkscda.com/volunteer/group");
    expect(sitemap).toContain("https://hkscda.com/report/audit");
  });
});
