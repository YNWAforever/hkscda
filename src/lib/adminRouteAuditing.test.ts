import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

// Tables covered by log_animal_mutation() in
// 20260803120000_audit_animal_mutations.sql. That trigger fires only when
// auth.uid() is set, i.e. for direct-from-browser writes. Anything reaching
// these tables over the service-role connection is invisible to it and has to
// write its own audit_log row at the app layer.
const TRIGGER_AUDITED_TABLES = ["animals", "animal_profile_internal", "animal_match"];

const MUTATION_METHODS = [".insert(", ".update(", ".upsert(", ".delete("];

// Server-only source. Browser components reach these tables with a real JWT, so
// the trigger already covers them; everything matched here runs over the
// service-role connection, where auth.uid() is null and the trigger bails out.
// Scanning only src/routes/api/admin would miss the layer CLAUDE.md actually
// tells you to put Supabase queries in — lib/<domain>/repository.server.ts.
const SERVER_SOURCE_GLOBS = ["src/routes/api/**/*.{ts,tsx}", "src/lib/**/*.server.{ts,tsx}"];

const ATOMIC_ANIMAL_MUTATIONS = [
  ["src/routes/api/admin/adoptions/animals/$id/status.ts", "update_animal_status_with_audit"],
  [
    "src/routes/api/admin/adoptions/animals/$id/internal.ts",
    "upsert_animal_internal_profile_with_audit",
  ],
] as const;

async function serverSourceFiles() {
  const groups = await Promise.all(
    SERVER_SOURCE_GLOBS.map((pattern) => Array.fromAsync(new Bun.Glob(pattern).scan("."))),
  );
  return groups.flat().filter((path) => !path.includes(".test."));
}

/**
 * The text of each `.from("<table>")` query chain, cut where the next `.from(`
 * begins. Testing the table name and the mutation method separately over the
 * whole file proves nothing: a route that only reads `animals` while inserting
 * into something else matches both halves and is neither caught nor exempt.
 */
function queryChains(source: string, table: string) {
  const chains: string[] = [];
  const needle = `.from("${table}")`;
  let index = source.indexOf(needle);
  while (index !== -1) {
    const rest = source.slice(index + needle.length);
    const next = rest.indexOf(".from(");
    chains.push(next === -1 ? rest : rest.slice(0, next));
    index = source.indexOf(needle, index + needle.length);
  }
  return chains;
}

function mutates(source: string, table: string) {
  return queryChains(source, table).some((chain) =>
    MUTATION_METHODS.some((method) => chain.includes(method)),
  );
}

/**
 * A comment mentioning audit_log is not an audit row — the previous whole-file
 * `includes("audit_log")` check passed on the explanatory comment that sits
 * directly above each insert, so it could not fail for the regression it exists
 * to catch. Require a real insert chain, or one of the atomic
 * mutate-and-audit RPCs that writes the row inside the same transaction.
 */
function writesAuditLog(source: string) {
  return (
    queryChains(source, "audit_log").some((chain) => chain.includes(".insert(")) ||
    /_with_audit"/.test(source)
  );
}

describe("admin route auditing", () => {
  test("service-role writes to trigger-audited animal tables log their own audit row", async () => {
    // The gap this closes: src/routes/api/admin/adoptions/animals/$id/status.ts
    // updated public.animals over the service-role client while discarding the
    // requireAdmin result, so neither the trigger (auth.uid() is null there) nor
    // the app layer recorded the change — an admin status edit left no trace at
    // all. Nothing structural stopped the next route from doing the same, so
    // this test is that tie.
    for (const file of await serverSourceFiles()) {
      const source = readFileSync(file, "utf8");
      const table = TRIGGER_AUDITED_TABLES.find((candidate) => mutates(source, candidate));
      if (!table) continue;

      expect(
        writesAuditLog(source),
        `${file} mutates public.${table} over the service-role connection but never writes an ` +
          `audit_log row. log_animal_mutation() skips service-role writes by design — this code ` +
          `must record its own actor-attributed row, either with a .from("audit_log").insert(...) ` +
          `or through a *_with_audit RPC.`,
      ).toBe(true);
    }
  });

  test("the animal admin routes mutate and audit in one transaction", async () => {
    // Both routes used to issue the mutation and the audit_log insert as two
    // PostgREST calls, so a failure on the second left the write applied and
    // unaudited while returning 500. Keep them on the atomic RPCs: the check
    // above goes quiet once a file stops mutating directly, so without this one
    // the guard would pass on a route that dropped auditing altogether.
    for (const [file, rpc] of ATOMIC_ANIMAL_MUTATIONS) {
      const source = readFileSync(file, "utf8");

      expect(
        source.includes(`"${rpc}"`),
        `${file} must go through public.${rpc} so the mutation and its audit_log row commit together.`,
      ).toBe(true);

      for (const table of TRIGGER_AUDITED_TABLES) {
        expect(
          mutates(source, table),
          `${file} mutates public.${table} directly again — that write cannot share a transaction ` +
            `with its audit_log row. Use public.${rpc}.`,
        ).toBe(false);
      }
    }
  });
});
