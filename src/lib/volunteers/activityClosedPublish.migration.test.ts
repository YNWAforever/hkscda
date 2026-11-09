import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { extractFunctionBody, normaliseSql } from "../operations/sqlFunctionBody";

/**
 * OPS-01 (audit 2026-11-09). The legacy volunteers table toggles any activity between published
 * and closed through `update_volunteer_activity_with_audit`, which only refused publishing an
 * unbound legacy draft (BUG-29). A cancelled activity could therefore be revived with one click,
 * bypassing the bulk cancel command's reason, registration cancellation and notification. The
 * fix redefines the wrapper with a terminal-state guard; this test pins that the redefinition is
 * the 20260914160736 body plus exactly that guard.
 */
const NAME = "public.update_volunteer_activity_with_audit";
const OLD = readFileSync(
  "supabase/migrations/20260914160736_volunteer_bulk_operations.sql",
  "utf8",
);
const NEW = readFileSync(
  "supabase/migrations/20261109101000_volunteer_activity_publish_respects_terminal_state.sql",
  "utf8",
);

const GUARD =
  " if p_input->>'status'='published' and (select status from public.volunteer_activity where id=p_activity_id) in('cancelled','closed') then return jsonb_build_object('kind','invalid','reason','activity_closed');end if;";

// Whitespace only: normaliseSql would also strip `--` text inside string literals.
const squash = (text: string) => text.replace(/\s+/g, " ").trim();

describe("OPS-01 migration: a terminal activity cannot be published again", () => {
  test("the body adds only the terminal-state guard to the 20260914160736 wrapper", () => {
    const next = extractFunctionBody(NEW, NAME);
    expect(next).toContain(GUARD);
    expect(squash(next.replace(GUARD, ""))).toBe(squash(extractFunctionBody(OLD, NAME)));
  });

  test("cancelled and closed are both refused with kind=invalid, reason=activity_closed", () => {
    const body = normaliseSql(extractFunctionBody(NEW, NAME));
    expect(body).toContain("in('cancelled','closed')");
    expect(body).toContain("jsonb_build_object('kind','invalid','reason','activity_closed')");
    // The guard must run before the delegation, so the base update and its audit row never run.
    expect(body.indexOf("'activity_closed'")).toBeLessThan(
      body.indexOf("return public.update_volunteer_activity_before_bulk"),
    );
  });

  test("the existing BUG-29 unbound-draft branch is preserved", () => {
    const body = normaliseSql(extractFunctionBody(NEW, NAME));
    expect(body).toContain("'target_date_preview_required'");
    expect(body).toContain(
      "return public.update_volunteer_activity_before_bulk(p_activity_id,p_actor_user_id,p_expected_updated_at,p_input);",
    );
  });

  test("same identity, pinned search_path and service-role-only grants", () => {
    const sql = normaliseSql(NEW);
    expect(sql).toContain(
      "create or replace function public.update_volunteer_activity_with_audit(p_activity_id uuid,p_actor_user_id uuid,p_expected_updated_at timestamptz,p_input jsonb) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $",
    );
    expect(sql).toContain(
      "revoke all on function public.update_volunteer_activity_with_audit(uuid,uuid,timestamptz,jsonb) from public,anon,authenticated;",
    );
    expect(sql).toContain(
      "grant execute on function public.update_volunteer_activity_with_audit(uuid,uuid,timestamptz,jsonb) to service_role;",
    );
    expect(sql).not.toContain("drop function");
    expect(sql).not.toMatch(/\bdelete from\b/);
  });
});
