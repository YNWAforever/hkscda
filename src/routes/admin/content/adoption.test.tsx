import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

describe("adoption information admin route", () => {
  test("registers a protected content route with the management surface", () => {
    const path = join(process.cwd(), "src/routes/admin/content/adoption.tsx");
    expect(existsSync(path)).toBe(true);
    const source = readFileSync(path, "utf8");
    expect(source).toContain('createFileRoute("/admin/content/adoption")');
    expect(source).toContain('requireAdminPageAccess("contentManagement", context.queryClient)');
    expect(source).toContain("<AdoptionInformationManagement />");
    expect(source).toContain('<AdminLayout activeSection="content">');
  });
});
