import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { extractFunctionBody, normaliseSql } from "../operations/sqlFunctionBody";

const NAME = "public.mutate_adoption_coordinator_with_audit";
const OLD = readFileSync(
  "supabase/migrations/20261002045253_r01_adoption_atomic_forward.sql",
  "utf8",
);
const NEW = readFileSync(
  "supabase/migrations/20261010130500_sp5b2_coordinator_status_delete_reason.sql",
  "utf8",
);
const OLD_DETAIL =
  "audit_detail := jsonb_build_object('category', current_status.category, 'key', current_status.key);";
const NEW_DETAIL =
  "audit_detail := pg_catalog.jsonb_strip_nulls(pg_catalog.jsonb_build_object( 'category', current_status.category, 'key', current_status.key, 'reason', nullif(pg_catalog.btrim(p_payload->>'reason'), '')));";

// Whitespace only: normaliseSql would also strip `--` text inside string literals.
const squash = (text: string) => text.replace(/\s+/g, " ").trim();

describe("mutate_adoption_coordinator_with_audit records the reason of a status delete", () => {
  test("the body differs from the 20261002045253 body only by the delete audit detail", () => {
    const next = squash(extractFunctionBody(NEW, NAME));
    expect(next).toContain(NEW_DETAIL);
    expect(next.split(NEW_DETAIL)).toHaveLength(2);
    expect(next.replace(NEW_DETAIL, OLD_DETAIL)).toBe(squash(extractFunctionBody(OLD, NAME)));
  });

  test("a delete with no reason still audits as category and key only", () => {
    const next = squash(extractFunctionBody(NEW, NAME));
    // jsonb_strip_nulls drops the null that nullif yields for a missing or blank reason.
    expect(next).toContain("pg_catalog.jsonb_strip_nulls(");
    expect(next).toContain("nullif(pg_catalog.btrim(p_payload->>'reason'), '')");
  });

  test("it replaces the function in place with a pinned search_path, so the identity is unchanged", () => {
    const sql = normaliseSql(NEW);
    expect(sql).toContain(
      "create or replace function public.mutate_adoption_coordinator_with_audit(p_actor_user_id uuid, p_entity text, p_operation text, p_id uuid, p_payload jsonb) returns jsonb language plpgsql security definer set search_path = '' as $function$",
    );
    expect(sql).not.toContain("drop function");
    expect(sql.match(/create (or replace )?function/g)).toHaveLength(1);
  });

  test("only service_role may execute it", () => {
    const sql = normaliseSql(NEW);
    expect(sql).toContain(
      "revoke all on function public.mutate_adoption_coordinator_with_audit(uuid, text, text, uuid, jsonb) from public, anon, authenticated, service_role;",
    );
    expect(sql).toContain(
      "grant execute on function public.mutate_adoption_coordinator_with_audit(uuid, text, text, uuid, jsonb) to service_role;",
    );
  });
});
