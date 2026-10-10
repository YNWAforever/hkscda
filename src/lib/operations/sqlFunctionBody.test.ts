import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { extractFunctionBody, normaliseSql } from "./sqlFunctionBody";

describe("extractFunctionBody", () => {
  test("extracts a plain $$ body", () => {
    const sql = "create function public.f(a int) returns void language sql as $$ select 1; $$;";
    expect(extractFunctionBody(sql, "public.f").trim()).toBe("select 1;");
  });

  test("extracts a $function$ body nested in an execute $definition$ wrapper", () => {
    const sql = `do $do$ begin
      execute $definition$create or replace function public.g(a int)
returns void
language plpgsql
as $function$
begin
  perform 1;
end;
$function$;$definition$;
    end $do$;`;
    const body = extractFunctionBody(sql, "public.g");
    expect(body).toContain("perform 1;");
    expect(body).not.toContain("definition");
  });

  test("picks the last of two definitions", () => {
    const sql = `create function public.h() returns int as $$ select 1 $$;
create or replace function public.h() returns int as $$ select 2 $$;`;
    expect(extractFunctionBody(sql, "public.h").trim()).toBe("select 2");
  });

  test("throws for a missing name", () => {
    expect(() =>
      extractFunctionBody("create function public.f() as $$ x $$;", "public.nope"),
    ).toThrow();
  });

  test("does not match a longer name that shares the prefix", () => {
    const sql = "create function public.f_extra() returns int as $$ select 9 $$;";
    expect(() => extractFunctionBody(sql, "public.f")).toThrow();
  });

  test("extracts deactivate_faq_entry_with_audit from the real FAQ migration", () => {
    const sql = readFileSync("supabase/migrations/20260830120000_faq_entry.sql", "utf8");
    const body = extractFunctionBody(sql, "public.deactivate_faq_entry_with_audit");
    expect(body.length).toBeGreaterThan(0);
    expect(body).toContain("update public.faq_entry set is_active = false where id = p_id;");
  });

  test("extracts mutate_admin_content_with_audit from the real r01 migration", () => {
    const sql = readFileSync(
      "supabase/migrations/20261002011249_r01_cms_atomic_forward.sql",
      "utf8",
    );
    const body = extractFunctionBody(sql, "public.mutate_admin_content_with_audit");
    expect(body.length).toBeGreaterThan(0);
    expect(body).toContain("referenced_asset_id uuid;");
    expect(body).not.toContain("$function$");
  });
});

describe("normaliseSql", () => {
  test("lowercases, strips comments and collapses whitespace", () => {
    expect(normaliseSql("SELECT  1 -- note\n  FROM   T")).toBe("select 1 from t");
  });
});
