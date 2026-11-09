import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * AUD-02 (audit 2026-11-09; inherited from AUDIT.md R3). Five policies from
 * 20260623160506_phase_2_donations_mvp.sql:280-305 still let any active `staff` read supporter
 * rows, supporter roles and consents over PostgREST (and update supporter/consent rows), while
 * every CRM API and the ROLE_ACCESS matrix are treasurer/admin-only. No later migration
 * redefines those policies, so this test pins the new migration's exact statements, its place
 * in the migration order, and that it touches nothing else.
 */
const MIGRATIONS = join(process.cwd(), "supabase", "migrations");
const FILE = "20261109103000_tighten_supporter_staff_rls.sql";
const SQL = readFileSync(join(MIGRATIONS, FILE), "utf8");

/** The latest merged migration before this batch. A new migration must sort after it. */
const PREVIOUS_LATEST_VERSION = "20261109102000";

const squash = (text: string) => text.replace(/\s+/g, " ").trim();
// Strip line comments before substring checks: the header explains the fix without being it.
const statementText = squash(SQL.replace(/--[^\n]*/g, " "));

/** The five policies that were still staff-wide, and the table each lives on. */
const POLICIES = [
  ["supporter", "staff can read supporters"],
  ["supporter", "staff can update supporters"],
  ["supporter_role", "staff can read supporter roles"],
  ["consent", "staff can read consents"],
  ["consent", "staff can update consents"],
] as const;

describe("AUD-02 migration: supporter and consent rows leave the staff role", () => {
  test("each still-staff-wide policy is dropped by name and recreated under the same name", () => {
    for (const [table, policy] of POLICIES) {
      expect(statementText).toContain(`drop policy if exists "${policy}" on public.${table};`);
      expect(statementText).toContain(`create policy "${policy}" on public.${table}`);
    }
    expect((statementText.match(/drop policy if exists/g) ?? []).length).toBe(POLICIES.length);
    expect((statementText.match(/create policy/g) ?? []).length).toBe(POLICIES.length);
  });

  test("every redefined policy names only treasurer and admin", () => {
    const roleLists = [...statementText.matchAll(/has_admin_role\(array\[([^\]]*)\]\)/g)].map(
      (match) => squash(match[1]),
    );
    // update policies carry both a USING and a WITH CHECK clause; the select ones one.
    expect(roleLists).toHaveLength(7);
    expect(new Set(roleLists)).toEqual(new Set(["'treasurer', 'admin'"]));
    expect(statementText).not.toContain("'staff'");
  });

  test("only supporter, supporter_role and consent policies are named", () => {
    const tables = new Set(
      [...statementText.matchAll(/policy (?:if exists )?"[^"]+" on public\.([a-z_]+)/g)].map(
        (match) => match[1],
      ),
    );
    expect(tables).toEqual(new Set(["supporter", "supporter_role", "consent"]));
    expect(statementText).not.toContain("supporter_consent_intent");
  });

  test("the table grants are untouched, so no privilege is handed back", () => {
    expect(statementText).not.toMatch(/\bgrant\b/i);
    expect(statementText).not.toMatch(/\brevoke\b/i);
    expect(statementText).not.toMatch(/\brow level security\b/i);
  });

  test("no rows are read or rewritten", () => {
    expect(statementText).not.toMatch(/\bdelete\s+from\b/i);
    expect(statementText).not.toMatch(/\binsert\s+into\b/i);
    expect(statementText).not.toMatch(/\bupdate\s+public\./i);
    expect(statementText).not.toMatch(/\btruncate\b/i);
  });

  test("the migration version sorts after the latest merged migration and stays unique", () => {
    expect(FILE.slice(0, 14)).toBe("20261109103000");
    expect(FILE.slice(0, 14) > PREVIOUS_LATEST_VERSION).toBe(true);
    const versions = readdirSync(MIGRATIONS)
      .filter((entry) => /^\d+_.+\.sql$/.test(entry))
      .map((entry) => entry.split("_")[0]);
    expect(new Set(versions).size).toBe(versions.length);
  });

  test("a behavioural RLS test keeps asserting the denial and the treasurer/admin allowance", () => {
    const path = join(process.cwd(), "supabase", "rls-tests", "moneyPii.rls.test.ts");
    expect(existsSync(path)).toBe(true);
    const source = readFileSync(path, "utf8");
    for (const text of [
      "AUD-02",
      "staff cannot select supporters",
      "staff cannot update supporters",
      "staff cannot select or update consents",
      "staff cannot read supporter roles",
      "treasurer and admin can select supporters",
      "treasurer can update supporters",
      "admin can update supporters",
      "treasurer and admin can select consents",
      "treasurer and admin can read supporter roles",
    ]) {
      expect(source).toContain(text);
    }
  });
});
