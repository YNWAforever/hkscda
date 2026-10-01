import { describe, expect, test } from "bun:test";
import { SQL } from "bun";
import {
  assertCloneUrl,
  assertSafeFixtureTables,
  hash,
  schemaStatements,
} from "./productionSchemaClone";

type FunctionProbe = {
  schema: string;
  name: string;
  body: string;
  language: string;
  system: boolean;
  source?: string;
  library?: string;
  extension?: string;
  extensionVersion?: string;
  owner?: string;
  arguments?: number;
  result?: string;
};
function metadataOnlyProbe(functions: FunctionProbe[], entrypoint: string, expression?: string) {
  // This implements catalog reads in memory; it cannot execute SQL or use a network.
  return {
    unsafe: async (query: string) => {
      if (query.includes("pg_proc p join"))
        return query.includes("n.nspname in ('public','private','auth','storage')")
          ? functions.filter((f) => ["public", "private", "auth", "storage"].includes(f.schema))
          : functions;
      if (query.includes("pg_trigger t join"))
        return [{ table_name: "public.synthetic", function_name: entrypoint }];
      if (query.includes("pg_attrdef")) return expression ? [{ expression }] : [];
      throw new Error("Unexpected probe metadata query");
    },
  } as unknown as SQL;
}

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
  test("CTAS and non-definition TABLE forms are rejected without evaluating requests", () => {
    for (const statement of [
      "CREATE TABLE public.synthetic AS SELECT extensions.http_head('https://example.invalid');",
      "CREATE TABLE public.synthetic AS SELECT 1;",
      "CREATE TABLE public.synthetic OF public.some_type;",
      "CREATE TABLE public.synthetic (id integer) AS SELECT 1;",
    ])
      expect(() => schemaStatements(statement)).toThrow();
  });
  test("all reviewed HTTP verbs and direct webhook entrypoints are refused in executable DDL", () => {
    for (const name of [
      "http",
      "http_get",
      "http_post",
      "http_put",
      "http_delete",
      "http_head",
      "http_patch",
      "http_request",
      "http_set_curlopt",
    ])
      expect(() =>
        schemaStatements(
          `CREATE INDEX synthetic ON public.synthetic ((extensions.${name}('https://example.invalid')));`,
        ),
      ).toThrow();
  });
  test("direct external webhook trigger is rejected even without a collected body", async () => {
    await expect(
      assertSafeFixtureTables(metadataOnlyProbe([], "supabase_functions.http_request"), [
        "synthetic",
      ]),
    ).rejects.toThrow();
  });
  test("transitive external-schema executable bodies are inspected before fixtures", async () => {
    const functions: FunctionProbe[] = [
      {
        schema: "public",
        name: "entry",
        body: "PERFORM bridge.forward();",
        language: "plpgsql",
        system: false,
      },
      {
        schema: "bridge",
        name: "forward",
        body: "SELECT extensions.http_head('https://example.invalid');",
        language: "sql",
        system: false,
      },
    ];
    await expect(
      assertSafeFixtureTables(metadataOnlyProbe(functions, "public.entry"), ["synthetic"]),
    ).rejects.toThrow();
    await expect(
      assertSafeFixtureTables(metadataOnlyProbe(functions, "public.absent", "bridge.forward()"), [
        "synthetic",
      ]),
    ).rejects.toThrow();
  });
  test("unreviewed external C and missing trigger entrypoints fail closed", async () => {
    await expect(
      assertSafeFixtureTables(
        metadataOnlyProbe(
          [
            {
              schema: "bridge",
              name: "opaque",
              body: "$libdir/unreviewed",
              language: "c",
              system: false,
            },
          ],
          "bridge.opaque",
        ),
        ["synthetic"],
      ),
    ).rejects.toThrow();
    await expect(
      assertSafeFixtureTables(metadataOnlyProbe([], "bridge.absent"), ["synthetic"]),
    ).rejects.toThrow();
  });
  test("only exact reviewed pgcrypto UUID implementation can pass opaque-function fencing", async () => {
    const uuid: FunctionProbe = {
      schema: "extensions",
      name: "gen_random_uuid",
      body: "",
      language: "c",
      system: false,
      source: "pg_random_uuid",
      library: "$libdir/pgcrypto",
      extension: "pgcrypto",
      extensionVersion: "1.3",
      owner: "postgres",
      arguments: 0,
      result: "uuid",
    };
    const entry: FunctionProbe = {
      schema: "public",
      name: "entry",
      body: "RETURN NEW;",
      language: "plpgsql",
      system: false,
    };
    await expect(
      assertSafeFixtureTables(
        metadataOnlyProbe([entry, uuid], "public.entry", "extensions.gen_random_uuid()"),
        ["synthetic"],
      ),
    ).resolves.toBeUndefined();
    await expect(
      assertSafeFixtureTables(
        metadataOnlyProbe(
          [entry, { ...uuid, library: "$libdir/unreviewed" }],
          "public.entry",
          "extensions.gen_random_uuid()",
        ),
        ["synthetic"],
      ),
    ).rejects.toThrow();
  });
  test("inspected safe external SQL helper remains usable, while absent dependencies fail closed", async () => {
    const entry: FunctionProbe = {
      schema: "public",
      name: "entry",
      body: "PERFORM bridge.clean();",
      language: "plpgsql",
      system: false,
    };
    const clean: FunctionProbe = {
      schema: "bridge",
      name: "clean",
      body: "SELECT 1;",
      language: "sql",
      system: false,
    };
    await expect(
      assertSafeFixtureTables(metadataOnlyProbe([entry, clean], "public.entry"), ["synthetic"]),
    ).resolves.toBeUndefined();
    await expect(
      assertSafeFixtureTables(metadataOnlyProbe([entry], "public.entry"), ["synthetic"]),
    ).rejects.toThrow();
  });
});
