import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { extractFunctionBody, normaliseSql } from "../operations/sqlFunctionBody";

const NAME = "public.void_receipt_with_audit";
const OLD = readFileSync(
  "supabase/migrations/20261002170945_r01_finance_callback_forward.sql",
  "utf8",
);
const NEW = readFileSync(
  "supabase/migrations/20261010130000_sp5b2_receipt_void_reason.sql",
  "utf8",
);
const REASON_EXPRESSION = "coalesce(nullif(pg_catalog.btrim(p_reason), ''), 'manual')";

describe("void_receipt_with_audit takes a reason", () => {
  test("the body differs from the r01 body only by the reason expression", () => {
    const next = extractFunctionBody(NEW, NAME);
    expect(next).toContain(REASON_EXPRESSION);
    const restored = next.replace(REASON_EXPRESSION, "'manual'");
    expect(normaliseSql(restored)).toBe(normaliseSql(extractFunctionBody(OLD, NAME)));
  });

  test("the old identity is dropped and the new one keeps its pinned search_path", () => {
    expect(NEW).toContain(
      "drop function if exists public.void_receipt_with_audit(uuid, uuid, uuid);",
    );
    expect(NEW).toContain("p_reason text default null");
    expect(NEW).toContain("set search_path = ''");
    expect(NEW).toContain("security definer");
  });

  test("only service_role may execute the new identity", () => {
    const sql = normaliseSql(NEW);
    expect(sql).toContain(
      "revoke all on function public.void_receipt_with_audit(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;",
    );
    expect(sql).toContain(
      "grant execute on function public.void_receipt_with_audit(uuid,uuid,uuid,text) to service_role;",
    );
  });
});
