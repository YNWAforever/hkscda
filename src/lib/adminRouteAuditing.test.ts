import { describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";

// Tables covered by log_animal_mutation() in
// 20260803120000_audit_animal_mutations.sql. That trigger fires only when
// auth.uid() is set, i.e. for direct-from-browser writes. Anything reaching
// these tables over the service-role connection is invisible to it and has to
// write its own audit_log row at the app layer.
const TRIGGER_AUDITED_TABLES = ["animals", "animal_profile_internal", "animal_match"];

const MUTATION_METHODS = ["insert", "update", "upsert", "delete"];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith(".ts") && !entry.name.includes(".test.")) out.push(full);
  }
  return out;
}

describe("admin route auditing", () => {
  test("service-role writes to trigger-audited animal tables log their own audit row", () => {
    // The gap this closes: src/routes/api/admin/adoptions/animals/$id/status.ts
    // updated public.animals over the service-role client while discarding the
    // requireAdmin result, so neither the trigger (auth.uid() is null there) nor
    // the app layer recorded the change — an admin status edit left no trace at
    // all. Nothing structural stopped the next route from doing the same, so
    // this test is that tie.
    const root = join(process.cwd(), "src", "routes", "api", "admin");

    for (const file of walk(root)) {
      const source = readFileSync(file, "utf8");
      if (!source.includes("createSupabaseServiceClient")) continue;

      const writesAuditedTable = TRIGGER_AUDITED_TABLES.some((table) => {
        if (!source.includes(`.from("${table}")`)) return false;
        // `.from("animals")` alone is a read. Only flag it when a mutation
        // method appears in the same file.
        return MUTATION_METHODS.some((method) => source.includes(`.${method}(`));
      });
      if (!writesAuditedTable) continue;

      expect(
        source.includes("audit_log"),
        `${relative(process.cwd(), file)} writes a trigger-audited animal table over the ` +
          `service-role connection but never inserts into audit_log. log_animal_mutation() ` +
          `skips service-role writes by design — this route must record its own actor-` +
          `attributed row (see the sibling internal.ts / status.ts routes).`,
      ).toBe(true);
    }
  });
});
