import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { extractFunctionBody, normaliseSql } from "../operations/sqlFunctionBody";

const NAME = "public.set_volunteer_registration_status_with_audit";
const OLD = readFileSync(
  "supabase/migrations/20260913062837_volunteer_versioned_policy.sql",
  "utf8",
);
const NEW = readFileSync(
  "supabase/migrations/20261010130100_sp5b2_volunteer_registration_reason.sql",
  "utf8",
);
const DETAIL_EXPRESSION =
  "pg_catalog.jsonb_strip_nulls(jsonb_build_object('status', p_status, 'reason', nullif(btrim(p_reason), '')))";

describe("set_volunteer_registration_status_with_audit takes a reason", () => {
  test("the body differs from the 20260913062837 body only by the audit detail expression", () => {
    const next = extractFunctionBody(NEW, NAME);
    expect(next).toContain(DETAIL_EXPRESSION);
    const restored = next.replace(DETAIL_EXPRESSION, "jsonb_build_object('status',p_status)");
    expect(normaliseSql(restored)).toBe(normaliseSql(extractFunctionBody(OLD, NAME)));
  });

  test("the 6-argument identity is dropped and the 7-argument one is created", () => {
    const sql = normaliseSql(NEW);
    expect(sql).toContain(
      "drop function if exists public.set_volunteer_registration_status_with_audit(uuid, uuid, timestamptz, text, text, boolean);",
    );
    expect(sql).toContain("create function public.set_volunteer_registration_status_with_audit(");
    expect(sql).not.toContain("create or replace function");
    expect(sql).toContain(
      "p_update_internal_notes boolean default true,p_reason text default null)",
    );
  });

  test("it pins search_path and stays security definer", () => {
    expect(normaliseSql(NEW)).toContain("security definer set search_path = public, pg_temp as $$");
  });

  test("only service_role may execute the new identity", () => {
    const sql = normaliseSql(NEW);
    expect(sql).toContain(
      "revoke all on function public.set_volunteer_registration_status_with_audit(uuid,uuid,timestamptz,text,text,boolean,text) from public,anon,authenticated,service_role;",
    );
    expect(sql).toContain(
      "grant execute on function public.set_volunteer_registration_status_with_audit(uuid,uuid,timestamptz,text,text,boolean,text) to service_role;",
    );
  });
});
