import { describe, expect, test } from "bun:test";
import { assertCloneUrl, hash, schemaStatements } from "./productionSchemaClone";

describe("R01 test-only clone boundaries", () => {
  test("remote, existing, ambiguous and unexpected-credential DB URLs are refused", () => {
    for (const url of [
      "postgresql://supabase_admin:postgres@remote.invalid:52322/r01_clone_" + "a".repeat(32),
      "postgresql://supabase_admin:postgres@127.0.0.1:52322/postgres",
      "postgresql://supabase_admin:postgres@127.0.0.1:52322/audit_pr135_20260929",
      "postgresql://postgres:postgres@127.0.0.1:52322/r01_clone_" + "a".repeat(32),
      "postgresql://supabase_admin:postgres@127.0.0.1:52322/r01_clone_" +
        "a".repeat(32) +
        "?options=-csearch_path=public",
    ])
      expect(() => assertCloneUrl(url)).toThrow();
    expect(
      assertCloneUrl(
        "postgresql://supabase_admin:postgres@127.0.0.1:52322/r01_clone_" + "a".repeat(32),
      ),
    ).toBe("r01_clone_" + "a".repeat(32));
  });
  test("catalog comparison ignores JSON key order and detects grant option/owner changes", () => {
    expect(hash({ owner: "postgres", acl: { grantable: false, role: "service_role" } })).toBe(
      hash({ acl: { role: "service_role", grantable: false }, owner: "postgres" }),
    );
    expect(hash({ owner: "postgres", grantable: false })).not.toBe(
      hash({ owner: "postgres", grantable: true }),
    );
    expect(hash({ owner: "postgres" })).not.toBe(hash({ owner: "supabase_admin" }));
  });
  test("data, role, cluster, schedule and network invocation SQL cannot enter restore", () => {
    for (const text of [
      "INSERT INTO public.donation VALUES (1);",
      "COPY public.donation FROM STDIN;",
      "DO $$BEGIN PERFORM net.http_post('x'); END$$;",
      "SELECT net.http_post('x');",
      "CREATE ROLE unsafe;",
      "GRANT service_role TO anon;",
      "ALTER SYSTEM SET log_statement='all';",
      "SET ROLE anon;",
      "SET session_replication_role=replica;",
      "SELECT cron.schedule('x','* * * * *','select 1');",
      "CREATE INDEX unsafe ON public.synthetic ((net.http_post('x')));",
    ])
      expect(() => schemaStatements(text)).toThrow();
  });
  test("dollar-quoted function bodies are stored as one definition without invocation", () => {
    expect(
      schemaStatements(
        "-- synthetic definition\nCREATE OR REPLACE FUNCTION public.example() RETURNS void LANGUAGE plpgsql AS $body$BEGIN PERFORM net.http_post('https://example.invalid'); END;$body$; ALTER FUNCTION public.example() OWNER TO postgres;",
      ),
    ).toHaveLength(2);
  });
  test("pinned dump inert settings allow quoted heap but never role or replication changes", () => {
    expect(
      schemaStatements(
        'SET default_table_access_method = "heap"; SET check_function_bodies = false;',
      ),
    ).toHaveLength(2);
    expect(() => schemaStatements('SET default_table_access_method = "network_method";')).toThrow();
  });
});
