import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The SP-5b-2 production runbook is what the owner follows to apply six migrations before the
 * merge. These checks pin the statements in it that, if wrong, would lead to a broken release.
 */
const RUNBOOK = readFileSync(
  join(
    process.cwd(),
    "docs/superpowers/plans/2026-10-10-admin-audit-sp5b2-production-migrations.md",
  ),
  "utf8",
);

function section(heading: string): string {
  const from = RUNBOOK.indexOf(heading);
  expect(from).toBeGreaterThanOrEqual(0);
  const next = RUNBOOK.indexOf("\n## ", from + heading.length);
  return RUNBOOK.slice(from, next === -1 ? undefined : next);
}

describe("the SP-5b-2 production migration runbook", () => {
  test("never says the new app works if it ships before the migrations", () => {
    expect(RUNBOOK).not.toContain("If the app ships first, it still works");
    const summary = section("## Summary");
    // M1, M2 and M4 are hard prerequisites: the new app names p_reason, so PostgREST cannot
    // find the old functions.
    expect(summary).toContain("M1, M2 and M4");
    expect(summary).toContain("PGRST202");
    expect(summary).toMatch(/every volunteer registration status change/i);
    expect(summary).toMatch(/receipt void/i);
    expect(summary).toMatch(/FAQ deactivat/i);
    // The order is stated plainly, and the old app keeps working on the new database (D1).
    expect(summary).toContain("Apply all six migrations to production first");
    expect(summary).toMatch(/then merge and deploy/i);
    expect(summary).toMatch(
      /app that is deployed today .* keeps working against the migrated database/,
    );
  });

  test("does not call every file idempotent: M1, M2 and M4 error on a re-run", () => {
    expect(RUNBOOK).not.toContain("idempotent");
    const before = section("## Before you start");
    expect(before).toContain("Apply each file once");
    expect(before).toMatch(/M1, M2 and M4 .*error.* re-run/);
    expect(before).toMatch(/M3, M5 and M6 .*`create or replace`/);
  });

  test("asks for one transaction per file and a schema cache reload on PGRST202", () => {
    const before = section("## Before you start");
    expect(before).toContain("one transaction");
    expect(before).toContain("notify pgrst, 'reload schema';");
  });

  test("escapes the underscore in every prosrc like pattern", () => {
    const patterns = [...RUNBOOK.matchAll(/prosrc like '([^\n]*?)' as /g)].map((match) => match[1]);
    expect(patterns).toHaveLength(6);
    for (const pattern of patterns) expect(pattern).not.toMatch(/(^|[^\\])_/);
    expect(RUNBOOK).toContain("prosrc like '%p\\_reason%'");
  });

  test("tells staff the internship review reason cap moved from 2000 to 500 characters", () => {
    const m3 = RUNBOOK.slice(RUNBOOK.indexOf("### M3."), RUNBOOK.indexOf("### M4."));
    expect(m3).toMatch(/2000 to 500 characters/);
    const deploy = section("## Deploy");
    expect(deploy).toMatch(/2000 to 500 characters/);
  });

  test("records that a refund also writes audit_log.detail.reason", () => {
    const row = RUNBOOK.split("\n").find((line) => line.startsWith("| Sponsorship finance"));
    expect(row).toBeDefined();
    expect(row).toContain("audit_log.detail.reason");
    expect(row).toMatch(/refund/);
  });
});
