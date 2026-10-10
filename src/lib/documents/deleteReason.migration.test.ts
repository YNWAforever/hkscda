import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { extractFunctionBody } from "../operations/sqlFunctionBody";

/**
 * Deleting a document or an annual report records its reason with no migration of its own: the
 * existing RPCs already write `p_values` to `audit_log.detail`. This pins that assumption on the
 * LATEST definition across every migration, so a later redefinition cannot silently drop it.
 */
const MIGRATIONS = "supabase/migrations";

function latestDefinition(qualifiedName: string): { file: string; body: string } {
  const create = new RegExp(
    `create\\s+(?:or\\s+replace\\s+)?function\\s+${qualifiedName.replace(".", "\\.")}\\s*\\(`,
    "i",
  );
  const files = readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  let latest: { file: string; sql: string } | null = null;
  for (const file of files) {
    const sql = readFileSync(`${MIGRATIONS}/${file}`, "utf8");
    if (create.test(sql)) latest = { file, sql };
  }
  if (!latest) throw new Error(`No migration defines ${qualifiedName}`);
  return { file: latest.file, body: extractFunctionBody(latest.sql, qualifiedName) };
}

const squash = (text: string) => text.replace(/\s+/g, " ").trim();

const CASES = [
  { name: "public.mutate_document_asset_with_audit", table: "document_assets" },
  { name: "public.mutate_annual_report_with_audit", table: "annual_reports" },
] as const;

describe("document and annual report deletes audit p_values without a migration", () => {
  for (const { name, table } of CASES) {
    describe(name, () => {
      const text = squash(latestDefinition(name).body);

      test("the audit row's detail is coalesce(p_values, '{}'::jsonb), so detail.reason is set", () => {
        const insert = /insert into public\.audit_log \([^)]*\) values \(([^;]*)\);/.exec(text);
        expect(insert).not.toBeNull();
        expect(squash(insert![1])).toEndWith("coalesce(p_values, '{}'::jsonb)");
      });

      test("the audit insert sits after the per-operation branches, so a delete reaches it", () => {
        const afterBranches = text.slice(text.indexOf("if result_id is null"));
        expect(afterBranches).toContain("insert into public.audit_log");
        expect(afterBranches).toContain("|| p_operation");
      });

      test("the delete branch never reads p_values, so { reason } changes nothing but the audit", () => {
        const start = text.indexOf("elsif p_operation = 'delete' then");
        const end = text.indexOf("else raise exception", start);
        expect(start).toBeGreaterThan(-1);
        expect(end).toBeGreaterThan(start);
        const branch = text.slice(start, end);
        expect(branch).toContain(`delete from public.${table} where id = p_id`);
        expect(branch).not.toContain("p_values");
      });
    });
  }
});
