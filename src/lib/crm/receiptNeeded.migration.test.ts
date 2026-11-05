import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { isReceiptEligible } from "../donations/domain";
import { extractFunctionBody, normaliseSql } from "../operations/sqlFunctionBody";

/**
 * The supporter list's "receipt needed" column and filter. These read the LATEST migration that
 * defines each function, so a later redefinition that loses the rule fails here.
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

/** The receipt threshold the app's isReceiptEligible applies (BUG-05), found rather than assumed. */
function receiptThresholdCents(): number {
  let threshold = 1;
  while (!isReceiptEligible({ amountCents: threshold, receiptRequested: true })) threshold += 1;
  return threshold;
}

/** A donation needs a receipt: succeeded, requested, retained >= threshold, no issued receipt. */
function expectNeedsReceiptRule(body: string) {
  expect(body).toMatch(/d\.status\s*=\s*'succeeded'/);
  expect(body).toMatch(/and\s+d\.receipt_requested\b/);
  expect(body).toMatch(
    new RegExp(
      `d\\.amount_cents\\s*-\\s*d\\.refunded_cents\\s*>=\\s*${receiptThresholdCents()}\\b`,
    ),
  );
  expect(body).toMatch(
    /not\s+exists\s*\(\s*select\s+1\s+from\s+public\.receipt\s+r\s+where\s+r\.status\s*=\s*'issued'\s+and\s+r\.donation_ids\s*@>\s*array\[d\.id\]\s*\)/,
  );
}

describe("CRM receipt needed", () => {
  // BUG-46: fixed by 20261030111000_crm_receipt_needed_only_unreceipted.sql. Verified against
  // Postgres 16 with the original functions: a supporter whose receipt was issued, or whose
  // donation failed, was refunded or is below the threshold, no longer shows or filters as
  // needing a receipt; an eligible donation without a receipt still does.
  test("BUG-46: crm_supporter_summary counts only succeeded, retained, requested donations with no issued receipt", () => {
    const body = latestBody("private.crm_supporter_summary");
    expect(body).not.toContain("bool_or(d.receipt_requested)");
    expectNeedsReceiptRule(body);
  });

  test("BUG-46: the receiptNeeded filter in crm_matching_supporters applies the same rule", () => {
    const body = latestBody("private.crm_matching_supporters");
    expect(body).not.toMatch(/d\.receipt_requested\s*=\s*\(p_filters->>'receiptneeded'\)::boolean/);
    expectNeedsReceiptRule(body);
  });

  test("BUG-46: the threshold is the one isReceiptEligible uses", () => {
    expect(receiptThresholdCents()).toBe(10000);
  });
});
