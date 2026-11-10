import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

const MIGRATION = "20261110160000_advisor_hardening.sql";

function readMigration() {
  return readFileSync(join(process.cwd(), "supabase", "migrations", MIGRATION), "utf8");
}

function normalized(sql: string) {
  return sql.replace(/\s+/g, " ").trim();
}

describe("database advisor hardening migration", () => {
  const sql = normalized(readMigration());

  test("drops the retired 4-argument proof-review overload and revokes the intended one", () => {
    expect(sql).toContain(
      "drop function if exists public.review_sponsorship_payment_proof(uuid, text, uuid, text);",
    );
    expect(sql).toContain(
      "revoke all on function public.review_sponsorship_payment_proof( uuid, text, uuid, text, jsonb, uuid ) from public, anon, authenticated, service_role;",
    );
  });

  test("pins the search_path of every advisor-flagged public/private helper", () => {
    expect(sql).toContain("alter function public.set_updated_at() set search_path = '';");
    expect(sql).toContain(
      "alter function private.is_adoption_instruction_plain_text(text, integer) set search_path = '';",
    );
    expect(sql).toContain(
      "alter function private.has_exact_jsonb_keys(jsonb, text[]) set search_path = '';",
    );
    expect(sql).toContain(
      "alter function private.is_valid_adoption_instruction_content(jsonb) set search_path = '';",
    );
  });

  test("removes the client EXECUTE grant from the trigger-only function", () => {
    expect(sql).toContain(
      "revoke execute on function public.volunteer_policy_contact_tasks() from public, anon, authenticated;",
    );
  });

  test("drops only the duplicate audit index, keeping the documented one", () => {
    expect(sql).toContain("drop index if exists public.audit_action_timestamp_idx;");
    expect(sql).not.toContain("audit_log_action_timestamp_idx");
  });

  test("never rewrites data", () => {
    expect(sql).not.toMatch(/\b(update|delete\s+from|truncate|insert\s+into)\b/i);
    expect(sql).not.toMatch(/\bdrop\s+table\b/i);
  });
});
