import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

function readMigration(fileName: string) {
  return readFileSync(join(process.cwd(), "supabase", "migrations", fileName), "utf8");
}

describe("supabase migration safety", () => {
  test("tightens adoption application PII access to staff and admins", () => {
    const sql = readMigration("20260626201620_secure_adoption_applications_policy.sql");

    expect(sql).toContain('drop policy if exists "admin only" on public.adoption_applications');
    expect(sql).not.toContain("auth.role() = 'authenticated'");
    expect(sql).toMatch(
      /on public\.adoption_applications for select[\s\S]*to authenticated[\s\S]*private\.has_admin_role\(array\['staff', 'admin'\]\)/,
    );
    expect(sql).toMatch(
      /on public\.adoption_applications for update[\s\S]*to authenticated[\s\S]*using \(private\.has_admin_role\(array\['staff', 'admin'\]\)\)[\s\S]*with check \(private\.has_admin_role\(array\['staff', 'admin'\]\)\)/,
    );
    expect(sql).toMatch(
      /on public\.adoption_applications for delete[\s\S]*to authenticated[\s\S]*private\.has_admin_role\(array\['staff', 'admin'\]\)/,
    );
  });

  test("adds webhook processing lease columns for idempotent retries", () => {
    const sql = readMigration("20260626202523_harden_webhook_event_processing.sql");

    expect(sql).toContain("add column if not exists processing_started_at timestamptz");
    expect(sql).toContain("add column if not exists processing_expires_at timestamptz");
    expect(sql).toContain("add column if not exists processing_owner text");
    expect(sql).toContain("webhook_event_processing_idx");
  });
});
