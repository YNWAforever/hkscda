import { readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test } from "bun:test";

const migrations = fileURLToPath(new URL("../supabase/migrations/", import.meta.url));

test("release migrations have distinct version IDs", () => {
  const files = readdirSync(migrations).filter((name) => /^\d{14}_.+\.sql$/.test(name));
  const byVersion = new Map<string, string[]>();
  for (const file of files) {
    const version = file.slice(0, 14);
    byVersion.set(version, [...(byVersion.get(version) ?? []), file]);
  }
  expect([...byVersion.values()].filter((names) => names.length > 1)).toEqual([]);
});
