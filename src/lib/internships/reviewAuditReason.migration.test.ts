import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { extractFunctionBody, normaliseSql } from "../operations/sqlFunctionBody";

const NAME = "public.internship_command";
const OLD = readFileSync(
  "supabase/migrations/20260913072454_veterinary_internship_workflow.sql",
  "utf8",
);
const NEW = readFileSync(
  "supabase/migrations/20261010130200_sp5b2_internship_review_audit_reason.sql",
  "utf8",
);
const OLD_INSERT =
  "insert into public.audit_log(actor_user_id,action,entity,entity_id,detail) values(p_actor,'internship.'||action,'internship',new_id::text,result);";
const NEW_INSERT =
  "insert into public.audit_log(actor_user_id,action,entity,entity_id,detail) values(p_actor,'internship.'||action,'internship',new_id::text,case when action = 'review' then result || pg_catalog.jsonb_build_object('status', p_command->>'status', 'reason', pg_catalog.btrim(p_command->>'reason')) else result end);";
const REPLAY_INSERT =
  "insert into public.internship_command_result(actor,key,payload_hash,result) values(p_actor,key_id,md5(p_command::text),result);";

// Whitespace only: normaliseSql would also strip `--` text inside string literals.
const squash = (text: string) => text.replace(/\s+/g, " ").trim();

describe("internship_command records the review status and reason", () => {
  test("the body differs from the 20260913072454 body only by the audit detail argument", () => {
    const next = squash(extractFunctionBody(NEW, NAME));
    expect(next).toContain(NEW_INSERT);
    expect(next.split(NEW_INSERT)).toHaveLength(2);
    expect(next.replace(NEW_INSERT, OLD_INSERT)).toBe(squash(extractFunctionBody(OLD, NAME)));
  });

  test("the replay row still stores the unchanged result, so a replay returns the same result", () => {
    const next = squash(extractFunctionBody(NEW, NAME));
    expect(next).toContain(REPLAY_INSERT);
    expect(next.indexOf(NEW_INSERT)).toBeLessThan(next.indexOf(REPLAY_INSERT));
  });

  test("it replaces the function in place, so the identity is unchanged", () => {
    const sql = normaliseSql(NEW);
    expect(sql).toContain(
      "create or replace function public.internship_command(p_actor uuid,p_command jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$",
    );
    expect(sql).not.toContain("drop function");
    expect(sql.match(/create (or replace )?function/g)).toHaveLength(1);
  });

  test("only service_role may execute it", () => {
    const sql = normaliseSql(NEW);
    expect(sql).toContain(
      "revoke all on function public.internship_command(uuid,jsonb) from public,anon,authenticated,service_role;",
    );
    expect(sql).toContain(
      "grant execute on function public.internship_command(uuid,jsonb) to service_role;",
    );
  });
});
