import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * AUTH-01 (audit 2026-11-09). `staff can read audit log` (20260623160506:351-354) let any active
 * staff, treasurer or admin read the whole audit trail over PostgREST with their own JWT, which
 * exposed admin-only access-management events and treasurer/admin finance events through a wider
 * surface than the APIs that own them. The fix is a migration, so this test pins its exact
 * statements and its place in the migration order.
 */
const MIGRATIONS = join(process.cwd(), "supabase", "migrations");
const FILE = "20261109100000_revoke_audit_log_browser_read.sql";
const SQL = readFileSync(join(MIGRATIONS, FILE), "utf8");

/** The latest merged migration before this audit's fixes. A new migration must sort after it. */
const PREVIOUS_LATEST_VERSION = "20261105101000";

const squash = (text: string) => text.replace(/\s+/g, " ").trim();
// Strip line comments before substring checks: the header explains the fix without being it.
const statementText = squash(SQL.replace(/--[^\n]*/g, " "));

describe("AUTH-01 migration: browser roles lose the audit trail", () => {
  test("the table privilege is revoked from both browser roles, not only the policy", () => {
    expect(statementText).toContain("revoke select on public.audit_log from anon, authenticated;");
  });

  test("the three-role read policy is dropped by name", () => {
    expect(statementText).toContain(
      'drop policy if exists "staff can read audit log" on public.audit_log;',
    );
  });

  test("service_role keeps its select grant and bypasses RLS for the API read paths", () => {
    expect(statementText).not.toMatch(/revoke[^;]*service_role/i);
    expect(statementText).not.toMatch(/drop policy[^;]*service_role/i);
  });

  test("nothing is granted back, so a future migration cannot silently reopen the table", () => {
    expect(statementText).not.toMatch(/\bgrant\b[^;]*on public\.audit_log/i);
  });

  test("no rows are rewritten or removed", () => {
    expect(statementText).not.toMatch(/\bdelete\s+(from\s+)?public\.audit_log/i);
    expect(statementText).not.toMatch(/\bupdate\s+public\.audit_log/i);
    expect(statementText).not.toMatch(/\btruncate\b/i);
  });

  test("the migration version sorts after the latest merged migration and stays unique", () => {
    expect(FILE.slice(0, 14)).toBe("20261109100000");
    expect(FILE.slice(0, 14) > PREVIOUS_LATEST_VERSION).toBe(true);
    const versions = readdirSync(MIGRATIONS)
      .filter((entry) => /^\d+_.+\.sql$/.test(entry))
      .map((entry) => entry.split("_")[0]);
    expect(new Set(versions).size).toBe(versions.length);
  });

  test("a behavioural RLS test keeps asserting the denial for every browser role", () => {
    const path = join(process.cwd(), "supabase", "rls-tests", "auditLogRead.rls.test.ts");
    expect(existsSync(path)).toBe(true);
    const source = readFileSync(path, "utf8");
    expect(source).toContain('from("audit_log")');
    for (const role of ["staff", "treasurer", "admin", "service"]) {
      expect(source).toContain(role);
    }
  });
});
