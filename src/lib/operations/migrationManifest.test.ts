import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

test("reviewed migration manifest checksums match canonical LF SQL", () => {
  const manifest = readFileSync(
    join(process.cwd(), "docs/evidence/audit-remediation-20260927/migration-manifest.csv"),
    "utf8",
  )
    .trim()
    .split(/\r?\n/);
  const mismatches: string[] = [];
  for (const row of manifest.slice(1)) {
    const [, file, expected] = row.split(",");
    const sql = readFileSync(join(process.cwd(), "supabase/migrations", file), "utf8").replace(
      /\r\n/g,
      "\n",
    );
    const actual = createHash("sha256").update(sql).digest("hex");
    if (expected !== actual)
      mismatches.push(file + ": expected " + expected + "; actual " + actual);
  }
  expect(mismatches).toEqual([]);
});
