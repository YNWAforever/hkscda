import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { extractFunctionBody, normaliseSql } from "../operations/sqlFunctionBody";

/**
 * Creating a supporter whose email already exists must never overwrite that supporter. These
 * read the LATEST migration that defines each function, so the fix lands in a new migration.
 */
const MIGRATIONS = "supabase/migrations";

function latestBody(qualifiedName: string): string {
  const create = new RegExp(
    `create\\s+(?:or\\s+replace\\s+)?function\\s+${qualifiedName.replace(".", "\\.")}\\s*\\(`,
    "i",
  );
  const files = readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  let latest: string | null = null;
  for (const file of files) {
    const sql = readFileSync(`${MIGRATIONS}/${file}`, "utf8");
    if (create.test(sql)) latest = sql;
  }
  if (!latest) throw new Error(`No migration defines ${qualifiedName}`);
  return normaliseSql(extractFunctionBody(latest, qualifiedName));
}

const EMAIL_UPSERT = /on conflict\s*\(\s*email\s*\)\s*do update/;

describe("supporter creation on an existing email", () => {
  // BUG-03: fixed by 20261029170000_crm_create_refuses_existing_email.sql. Verified against
  // Postgres 16 with the real CRM functions; an exact retry still returns the same supporter.
  test("BUG-03: the create branch of mutate_crm_supporter_with_audit refuses an existing email instead of overwriting it", () => {
    const body = latestBody("public.mutate_crm_supporter_with_audit");
    const start = body.indexOf("if p_operation = 'create' then");
    const end = body.indexOf("elsif p_operation = 'update' then", start);
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const createBranch = body.slice(start, end);
    expect(createBranch).not.toMatch(EMAIL_UPSERT);
    expect(createBranch).not.toContain("deleted_at = null");
    expect(body).toContain("supporter_exists");
  });

  // BUG-23: known defect, fix deferred (needs a migration; see docs/BUGS.md). Remove .failing when fixed.
  test.failing(
    "BUG-23: record_manual_gift_with_audit reuses an existing supporter unchanged on an email conflict",
    () => {
      const body = latestBody("public.record_manual_gift_with_audit");
      const start = body.indexOf("insert into public.supporter(");
      expect(start).toBeGreaterThan(-1);
      const end = body.indexOf("insert into public.supporter_role", start);
      expect(end).toBeGreaterThan(start);
      expect(body.slice(start, end)).not.toMatch(EMAIL_UPSERT);
    },
  );
});
