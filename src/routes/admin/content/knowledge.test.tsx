import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

describe("admin knowledge content route", () => {
  test("mounts knowledge management inside the content admin area", () => {
    const source = readFileSync(
      join(process.cwd(), "src/routes/admin/content/knowledge.tsx"),
      "utf8",
    );
    expect(source).toContain('createFileRoute("/admin/content/knowledge")');
    expect(source).toContain('requireAdminPageAccess("contentManagement", context.queryClient)');
    expect(source).toContain('<AdminLayout activeSection="content">');
    expect(source).toContain("<KnowledgeManagement />");
  });
});
