import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { extractFunctionBody, normaliseSql } from "../operations/sqlFunctionBody";

/**
 * Who may publish a payment-method change. These read the LATEST migration that defines each
 * function, so a later redefinition that drops the rule fails here.
 */
const MIGRATIONS = "supabase/migrations";

function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS)
    .filter((name) => name.endsWith(".sql"))
    .sort();
}

function latestBody(qualifiedName: string): string {
  const create = new RegExp(
    `create\\s+(?:or\\s+replace\\s+)?function\\s+${qualifiedName.replace(".", "\\.")}\\s*\\(`,
    "i",
  );
  let latest: string | null = null;
  for (const file of migrationFiles()) {
    const sql = readFileSync(`${MIGRATIONS}/${file}`, "utf8");
    if (create.test(sql)) latest = sql;
  }
  if (!latest) throw new Error(`No migration defines ${qualifiedName}`);
  return normaliseSql(extractFunctionBody(latest, qualifiedName));
}

describe("payment public config publish separation", () => {
  // BUG-38: fixed by 20261030110000_payment_config_editor_cannot_publish.sql. Verified against
  // Postgres 16 with the original functions: an editor whose draft someone else submitted is
  // now refused with 42501; a treasurer who did not touch the draft still publishes.
  test("BUG-38: publish_payment_public_config refuses any actor who edited the draft, not only the submitter", () => {
    const body = latestBody("public.publish_payment_public_config");
    expect(body).toMatch(/actor\.id\s*=\s*any\s*\(\s*config_to_publish\.edited_by\s*\)/);
    expect(body).toContain("a different treasurer or admin must publish this change");
    // The submitter rule stays.
    expect(body).toMatch(/config_to_publish\.submitted_by\s*=\s*actor\.id/);
  });

  test("BUG-38: every content edit records its editor in edited_by, whatever path wrote it", () => {
    const sql = normaliseSql(
      readFileSync(
        `${MIGRATIONS}/${migrationFiles().find((file) => file.startsWith("20261030110000_"))}`,
        "utf8",
      ),
    );
    expect(sql).toContain("add column if not exists edited_by uuid[] not null default '{}'");
    const trigger = normaliseSql(
      extractFunctionBody(sql, "public.track_payment_public_config_editors"),
    );
    // The column is never taken from the writer: an insert starts from its creator and an update
    // keeps what was recorded, so a direct write cannot clear the list.
    expect(trigger).toContain("new.edited_by := old.edited_by");
    for (const column of [
      "method",
      "is_publicly_visible",
      "display_label_zh",
      "display_label_en",
      "sort_order",
      "details",
    ]) {
      expect(trigger).toContain(`new.${column} is distinct from old.${column}`);
    }
    expect(sql).toMatch(
      /before insert or update on public\.payment_public_config for each row execute function public\.track_payment_public_config_editors\(\)/,
    );
  });
});
