import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { extractFunctionBody, normaliseSql } from "../operations/sqlFunctionBody";

const NAME = "public.mutate_admin_content_with_audit";
const OLD = readFileSync("supabase/migrations/20261002011249_r01_cms_atomic_forward.sql", "utf8");
const NEW = readFileSync(
  "supabase/migrations/20261010130400_sp5b2_admin_content_delete_reason.sql",
  "utf8",
);
const OLD_DETAIL = "case when p_operation = 'upsert' then p_payload else '{}'::jsonb end";
const NEW_DETAIL =
  "case when p_operation = 'upsert' then p_payload else pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object( 'reason', nullif(pg_catalog.btrim(p_payload->>'reason'), ''))) end";

// Whitespace only: normaliseSql would also strip `--` text inside string literals.
const squash = (text: string) => text.replace(/\s+/g, " ").trim();

describe("mutate_admin_content_with_audit records the reason of a non-upsert operation", () => {
  test("the body differs from the 20261002011249 body only by the audit detail expression", () => {
    const next = squash(extractFunctionBody(NEW, NAME));
    expect(next).toContain(NEW_DETAIL);
    expect(next.split(NEW_DETAIL)).toHaveLength(2);
    expect(next.replace(NEW_DETAIL, OLD_DETAIL)).toBe(squash(extractFunctionBody(OLD, NAME)));
  });

  test("an upsert still audits its payload, and a payload with no reason audits as an empty object", () => {
    const next = squash(extractFunctionBody(NEW, NAME));
    expect(next).toContain("case when p_operation = 'upsert' then p_payload else");
    // jsonb_strip_nulls drops the null that nullif yields for a missing or blank reason.
    expect(next).toContain("pg_catalog.jsonb_strip_nulls(");
    expect(next).toContain("nullif(pg_catalog.btrim(p_payload->>'reason'), '')");
  });

  test("it replaces the function in place with a pinned search_path, so the identity is unchanged", () => {
    const sql = normaliseSql(NEW);
    expect(sql).toContain(
      "create or replace function public.mutate_admin_content_with_audit(p_actor_user_id uuid, p_entity text, p_operation text, p_id uuid, p_payload jsonb) returns jsonb language plpgsql security definer set search_path = '' as $function$",
    );
    expect(sql).not.toContain("drop function");
    expect(sql.match(/create (or replace )?function/g)).toHaveLength(1);
  });

  test("only service_role may execute it", () => {
    const sql = normaliseSql(NEW);
    expect(sql).toContain(
      "revoke all on function public.mutate_admin_content_with_audit(uuid, text, text, uuid, jsonb) from public, anon, authenticated, service_role;",
    );
    expect(sql).toContain(
      "grant execute on function public.mutate_admin_content_with_audit(uuid, text, text, uuid, jsonb) to service_role;",
    );
  });
});
