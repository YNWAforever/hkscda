import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { extractFunctionBody, normaliseSql } from "../operations/sqlFunctionBody";

/**
 * One `receipt.issue` audit row per receipt. These read the LATEST migration that defines the
 * function, so a later redefinition that loses the rule fails here.
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

describe("receipt issue audit", () => {
  // BUG-49: fixed by 20261030112000_receipt_issue_audit_once.sql. Verified against Postgres 16
  // with the original function: a second treasurer issuing an existing receipt, or a treasurer
  // issuing one the delivery job already issued, no longer writes a receipt.issue row.
  test("BUG-49: issue_receipt_with_audit writes receipt.issue only when the receipt did not already exist", () => {
    const body = latestBody("public.issue_receipt_with_audit");
    const guard = body.indexOf("if not v_receipt.already_existed then");
    const insert = body.indexOf("insert into public.audit_log");
    expect(guard).toBeGreaterThan(-1);
    expect(insert).toBeGreaterThan(guard);
    // Exactly one audit insert, and it sits inside that guard.
    expect(body.split("insert into public.audit_log").length).toBe(2);
    expect(body.indexOf("end if;", guard)).toBeGreaterThan(insert);
    // The per-actor lookup that let a second actor write a second row is gone.
    expect(body).not.toContain("a.actor_user_id = p_actor");
  });
});
