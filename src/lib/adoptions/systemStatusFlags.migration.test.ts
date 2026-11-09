import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { extractFunctionBody, normaliseSql } from "../operations/sqlFunctionBody";

/**
 * OPS-02 (audit 2026-11-09). The coordinator status catalogue edits `is_active`, `is_closing` and
 * `is_final` on every row, including seeded `is_system` statuses whose keys the adoption lifecycle
 * reads (`approved` match status, `completed` follow-up status, the closing case statuses). The
 * RPC only repeated the service guard for key/category, so a system status's flags could be
 * changed and silently block finalisation, task completion or case closing. The fix redefines the
 * latest RPC with that guard; this test pins the redefinition to the 20261030103000 body plus the
 * new guard.
 */
const NAME = "public.mutate_adoption_coordinator_with_audit";
const OLD = readFileSync(
  "supabase/migrations/20261030103000_match_create_checks_animal_and_case.sql",
  "utf8",
);
const NEW = readFileSync(
  "supabase/migrations/20261109102000_adoption_system_status_flags_immutable.sql",
  "utf8",
);

const GUARD = `      -- OPS-02: the three semantic flags are part of a system status's identity. Labels,
      -- colour and sort order stay editable; changing is_active/is_closing/is_final would
      -- break the seeded status keys the adoption lifecycle reads.
      if current_status.is_system and
         (desired_status.is_active is distinct from current_status.is_active
          or desired_status.is_closing is distinct from current_status.is_closing
          or desired_status.is_final is distinct from current_status.is_final) then
        raise exception 'System status flags cannot be changed' using errcode = '23514';
      end if;`;

// Whitespace only: normaliseSql would also strip `--` text inside string literals.
const squash = (text: string) => text.replace(/\s+/g, " ").trim();

describe("OPS-02 migration: a system coordinator status's flags are immutable", () => {
  test("the body adds only the flags guard to the 20261030103000 body", () => {
    const next = extractFunctionBody(NEW, NAME);
    expect(next).toContain(GUARD);
    expect(squash(next.replace(GUARD, ""))).toBe(squash(extractFunctionBody(OLD, NAME)));
  });

  test("the flags guard follows the key/category identity guard and raises 23514", () => {
    const body = normaliseSql(extractFunctionBody(NEW, NAME));
    const identity = body.indexOf("'system status identity cannot be changed'");
    const flags = body.indexOf("'system status flags cannot be changed'");
    expect(identity).toBeGreaterThan(-1);
    expect(flags).toBeGreaterThan(identity);
    expect(body).toContain("using errcode = '23514'");
    expect(body).toContain("is distinct from current_status.is_active");
    expect(body).toContain("is distinct from current_status.is_closing");
    expect(body).toContain("is distinct from current_status.is_final");
    expect(body).toMatch(/if current_status\.is_system and/);
  });

  test("labels, colour and sort order remain writable, and every other branch is preserved", () => {
    const body = normaliseSql(extractFunctionBody(NEW, NAME));
    expect(body).toContain("label_zh = desired_status.label_zh");
    expect(body).toContain("color = desired_status.color");
    expect(body).toContain("sort_order = desired_status.sort_order");
    for (const branch of [
      "p_operation = 'create'",
      "p_operation in ('update', 'delete')",
      "p_entity = 'adoption_followup' and p_operation = 'create'",
      "p_entity = 'adoption_followup' and p_operation = 'update'",
      "p_entity = 'animal_match' and p_operation = 'create'",
      "'animal already has an active match for this case'",
      "'unsupported adoption coordinator mutation'",
    ]) {
      expect(body).toContain(branch);
    }
  });

  test("same identity, search_path = '' and service-role-only grants", () => {
    const sql = normaliseSql(NEW);
    expect(sql).toContain(
      "create or replace function public.mutate_adoption_coordinator_with_audit(p_actor_user_id uuid, p_entity text, p_operation text, p_id uuid, p_payload jsonb) returns jsonb language plpgsql security definer set search_path = '' as $function$",
    );
    expect(sql).toContain(
      "revoke all on function public.mutate_adoption_coordinator_with_audit(uuid, text, text, uuid, jsonb) from public, anon, authenticated, service_role;",
    );
    expect(sql).toContain(
      "grant execute on function public.mutate_adoption_coordinator_with_audit(uuid, text, text, uuid, jsonb) to service_role;",
    );
    expect(sql).not.toContain("drop function");
    expect(sql.match(/create or replace function/g)).toHaveLength(1);
  });
});
