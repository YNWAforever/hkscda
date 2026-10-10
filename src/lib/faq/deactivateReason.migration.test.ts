import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { extractFunctionBody, normaliseSql } from "../operations/sqlFunctionBody";

const NAME = "public.deactivate_faq_entry_with_audit";
const OLD = readFileSync("supabase/migrations/20260830120000_faq_entry.sql", "utf8");
const NEW = readFileSync(
  "supabase/migrations/20261010130300_sp5b2_faq_deactivate_reason.sql",
  "utf8",
);
const DETAIL_EXPRESSION =
  "jsonb_strip_nulls(jsonb_build_object('reason', nullif(btrim(p_reason), '')))";

describe("deactivate_faq_entry_with_audit takes a reason", () => {
  test("the body differs from the 20260830120000 body only by the audit detail expression", () => {
    const next = extractFunctionBody(NEW, NAME);
    expect(next).toContain(DETAIL_EXPRESSION);
    const restored = next.replace(DETAIL_EXPRESSION, "'{}'::jsonb");
    expect(normaliseSql(restored)).toBe(normaliseSql(extractFunctionBody(OLD, NAME)));
  });

  test("the (uuid, uuid) identity is dropped and the (uuid, uuid, text) one is created", () => {
    const sql = normaliseSql(NEW);
    expect(sql).toContain(
      "drop function if exists public.deactivate_faq_entry_with_audit(uuid, uuid);",
    );
    expect(sql).toContain("create function public.deactivate_faq_entry_with_audit(");
    expect(sql).not.toContain("create or replace function");
    expect(sql).toContain("p_id uuid, p_reason text default null )");
  });

  test("it pins search_path and stays security definer", () => {
    expect(normaliseSql(NEW)).toContain("security definer set search_path = public, pg_temp as $$");
  });

  test("only service_role may execute the new identity", () => {
    const sql = normaliseSql(NEW);
    expect(sql).toContain(
      "revoke all on function public.deactivate_faq_entry_with_audit(uuid, uuid, text) from public, anon, authenticated, service_role;",
    );
    expect(sql).toContain(
      "grant execute on function public.deactivate_faq_entry_with_audit(uuid, uuid, text) to service_role;",
    );
  });
});
