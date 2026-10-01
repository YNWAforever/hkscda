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
  library?: string | null;
  extension?: string | null;
  extensionVersion?: string | null;
  owner?: string;
  arguments?: number;
  result?: string;
  config?: string[];
  argumentTypes?: string[];
  oid?: number;
};
type OperatorProbe = {
  oid?: number;
  schema: string;
  name: string;
  system: boolean;
  implementation: string;
  leftType?: string;
  rightType?: string;
  owner?: string;
  restriction?: string | null;
  join?: string | null;
  implementationOid?: number;
  restrictionOid?: number | null;
  joinOid?: number | null;
};
function metadataOnlyProbe(
  functions: FunctionProbe[],
  entrypoint: string,
  expression?: string,
  operators: OperatorProbe[] = [],
  operatorOids?: number[],
) {
  // This implements catalog reads in memory; it cannot execute SQL or use a network.
  return {
    unsafe: async (query: string) => {
      if (query.includes("pg_proc p join"))
        return query.includes("n.nspname in ('public','private','auth','storage')")
          ? functions.filter((f) => ["public", "private", "auth", "storage"].includes(f.schema))
          : functions;
      if (query.includes("pg_trigger t join"))
        return [{ table_name: "public.synthetic", function_name: entrypoint }];
      if (query.includes("pg_attrdef")) return expression ? [{ expression, operatorOids }] : [];
      if (query.includes("pg_operator o join")) return operators;
      if (query === "set local search_path=pg_catalog") return [];
      throw new Error("Unexpected probe metadata query");
    },
    begin: async (callback: (tx: unknown) => Promise<unknown>) =>
      callback(metadataOnlyProbe(functions, entrypoint, expression, operators, operatorOids)),
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
  test("explicit custom operators cannot conceal opaque executable paths", async () => {
    const functions: FunctionProbe[] = [
      {
        schema: "public",
        name: "entry",
        body: "PERFORM 1 OPERATOR(bridge.##) 2;",
        language: "plpgsql",
        system: false,
      },
      { schema: "bridge", name: "opaque", body: "", language: "c", system: false },
    ];
    await expect(
      assertSafeFixtureTables(
        metadataOnlyProbe(functions, "public.entry", undefined, [
          { schema: "bridge", name: "##", system: false, implementation: "bridge.opaque" },
        ]),
        ["synthetic"],
      ),
    ).rejects.toThrow();
  });
  test("unqualified custom operator and configured search_path cannot conceal opaque execution", async () => {
    const functions: FunctionProbe[] = [
      {
        schema: "public",
        name: "entry",
        body: "PERFORM 1 ## 2;",
        language: "plpgsql",
        system: false,
        config: ["search_path=bridge, public"],
      },
      { schema: "bridge", name: "opaque", body: "", language: "c", system: false },
    ];
    await expect(
      assertSafeFixtureTables(
        metadataOnlyProbe(functions, "public.entry", undefined, [
          { schema: "bridge", name: "##", system: false, implementation: "bridge.opaque" },
        ]),
        ["synthetic"],
      ),
    ).rejects.toThrow();
    functions[0].body = "PERFORM 1 = 2;";
    await expect(
      assertSafeFixtureTables(
        metadataOnlyProbe(functions, "public.entry", undefined, [
          { schema: "bridge", name: "=", system: false, implementation: "bridge.opaque" },
        ]),
        ["synthetic"],
      ),
    ).rejects.toThrow();
  });
  test("custom operators in defaults/checks are rejected independently of triggers", async () => {
    const functions: FunctionProbe[] = [
      { schema: "public", name: "entry", body: "RETURN NEW;", language: "plpgsql", system: false },
      { schema: "bridge", name: "opaque", body: "", language: "c", system: false },
    ];
    for (const expression of ["1 OPERATOR(bridge.##) 2", "1 ## 2", '1 OPERATOR("bridge".##) 2'])
      await expect(
        assertSafeFixtureTables(
          metadataOnlyProbe(functions, "public.entry", expression, [
            { schema: "bridge", name: "##", system: false, implementation: "bridge.opaque" },
          ]),
          ["synthetic"],
        ),
      ).rejects.toThrow();
  });
  test("backend signaling and global configuration primitives are never fixture paths", async () => {
    for (const name of [
      "pg_terminate_backend",
      "pg_cancel_backend",
      "pg_reload_conf",
      "set_config",
    ])
      for (const qualified of [true, false]) {
        const call = `${qualified ? "pg_catalog." : ""}${name}(1)`;
        const functions: FunctionProbe[] = [
          {
            schema: "public",
            name: "entry",
            body: `PERFORM ${call};`,
            language: "plpgsql",
            system: false,
          },
          { schema: "pg_catalog", name, body: "", language: "internal", system: true },
        ];
        await expect(
          assertSafeFixtureTables(metadataOnlyProbe(functions, "public.entry"), ["synthetic"]),
        ).rejects.toThrow();
        functions[0].body = "RETURN NEW;";
        await expect(
          assertSafeFixtureTables(metadataOnlyProbe(functions, "public.entry", call), [
            "synthetic",
          ]),
        ).rejects.toThrow();
      }
  });
  test("only pinned dump's empty session search_path setting survives the config fence", () => {
    expect(
      schemaStatements("SELECT pg_catalog.set_config('search_path', '', false);"),
    ).toHaveLength(1);
    for (const statement of [
      "SELECT pg_catalog.set_config('search_path', 'bridge', false);",
      "SELECT pg_catalog.set_config('session_replication_role', 'replica', false);",
      "CREATE INDEX synthetic ON public.synthetic ((pg_catalog.pg_reload_conf()));",
    ])
      expect(() => schemaStatements(statement)).toThrow();
  });
  test("prefix and transitive operator paths fail closed; explicit cataloged core calls remain usable", async () => {
    const entry: FunctionProbe = {
      schema: "public",
      name: "entry",
      body: "PERFORM bridge.forward();",
      language: "plpgsql",
      system: false,
    };
    const forward: FunctionProbe = {
      schema: "bridge",
      name: "forward",
      body: "SELECT ## 2;",
      language: "sql",
      system: false,
    };
    const operators = [
      { schema: "bridge", name: "##", system: false, implementation: "bridge.opaque" },
    ];
    await expect(
      assertSafeFixtureTables(
        metadataOnlyProbe([entry, forward], "public.entry", undefined, operators),
        ["synthetic"],
      ),
    ).rejects.toThrow();
    entry.body = "PERFORM 1 OPERATOR(pg_catalog.=) 1;";
    operators.push({
      schema: "pg_catalog",
      name: "=",
      system: true,
      implementation: "pg_catalog.int4eq",
    });
    await expect(
      assertSafeFixtureTables(
        metadataOnlyProbe([entry], "public.entry", "1 OPERATOR(pg_catalog.=) 1", operators),
        ["synthetic"],
      ),
    ).resolves.toBeUndefined();
    entry.body = "PERFORM 1 OPERATOR(pg_catalog.##) 2;";
    await expect(
      assertSafeFixtureTables(metadataOnlyProbe([entry], "public.entry", undefined, operators), [
        "synthetic",
      ]),
    ).rejects.toThrow();
  });
  test("seven exact reviewed native operator contracts permit the existing comparison paths", async () => {
    for (const [symbol, suffix] of [
      ["=", "eq"],
      ["<>", "ne"],
      ["<", "lt"],
      ["<=", "le"],
      [">", "gt"],
      [">=", "ge"],
      ["%", "similarity"],
    ]) {
      const similarity = suffix === "similarity";
      const name = similarity ? "similarity_op" : `citext_${suffix}`;
      const type = similarity ? "pg_catalog.text" : "public.citext";
      const native: FunctionProbe = {
        oid: 100001,
        schema: "public",
        name,
        body: "",
        language: "c",
        system: false,
        source: name,
        library: similarity ? "$libdir/pg_trgm" : "$libdir/citext",
        extension: similarity ? "pg_trgm" : "citext",
        extensionVersion: "1.6",
        owner: "supabase_admin",
        arguments: 2,
        argumentTypes: [type, type],
        result: "boolean",
      };
      const op: OperatorProbe = {
        schema: "public",
        name: symbol,
        system: false,
        implementation: `public.${name}`,
        implementationOid: native.oid,
        leftType: type,
        rightType: type,
        owner: "supabase_admin",
        restriction: null,
        restrictionOid: null,
        join: null,
        joinOid: null,
      };
      const entry: FunctionProbe = {
        schema: "public",
        name: "entry",
        body: `PERFORM x ${symbol} y;`,
        language: "plpgsql",
        system: false,
      };
      await expect(
        assertSafeFixtureTables(
          metadataOnlyProbe([entry, native], "public.entry", `x OPERATOR(public.${symbol}) y`, [
            op,
          ]),
          ["synthetic"],
        ),
      ).resolves.toBeUndefined();
      for (const variant of [
        { library: "$libdir/unreviewed" },
        { source: "opaque" },
        { argumentTypes: ["pg_catalog.int4", type] },
        { owner: "unreviewed" },
        { extensionVersion: "9.9" },
        { extension: "other" },
        { extension: null },
        { language: "internal" },
      ])
        await expect(
          assertSafeFixtureTables(
            metadataOnlyProbe([entry, { ...native, ...variant }], "public.entry", undefined, [op]),
            ["synthetic"],
          ),
        ).rejects.toThrow();
      for (const variant of [
        { leftType: "pg_catalog.int4" },
        { implementation: "bridge.opaque" },
        { owner: "unreviewed" },
        { restriction: "bridge.opaque" },
        { join: "bridge.opaque" },
        { implementationOid: 999999 },
        { restrictionOid: 999999 },
      ])
        await expect(
          assertSafeFixtureTables(
            metadataOnlyProbe([entry, native], "public.entry", undefined, [{ ...op, ...variant }]),
            ["synthetic"],
          ),
        ).rejects.toThrow();
      const plannerPairs: Record<string, [string, number, string, number]> = {
        "=": ["eqsel", 101, "eqjoinsel", 105],
        "<>": ["neqsel", 102, "neqjoinsel", 106],
        "<": ["scalarltsel", 103, "scalarltjoinsel", 107],
        "<=": ["scalarlesel", 336, "scalarlejoinsel", 386],
        ">": ["scalargtsel", 104, "scalargtjoinsel", 108],
        ">=": ["scalargesel", 337, "scalargejoinsel", 398],
        "%": ["matchingsel", 5040, "matchingjoinsel", 5041],
      };
      const [restName, restOid, joinName, joinOid] = plannerPairs[symbol];
      const callbacks: FunctionProbe[] = [false, true].map((join) => ({
        schema: "pg_catalog",
        name: join ? joinName : restName,
        oid: join ? joinOid : restOid,
        body: "",
        language: "internal",
        system: true,
        source: join ? joinName : restName,
        library: null,
        extension: null,
        owner: "supabase_admin",
        arguments: join ? 5 : 4,
        argumentTypes: join
          ? [
              "pg_catalog.internal",
              "pg_catalog.oid",
              "pg_catalog.internal",
              "pg_catalog.int2",
              "pg_catalog.internal",
            ]
          : ["pg_catalog.internal", "pg_catalog.oid", "pg_catalog.internal", "pg_catalog.int4"],
        result: "double precision",
      }));
      const planned = {
        ...op,
        restriction: `pg_catalog.${restName}`,
        restrictionOid: restOid,
        join: `pg_catalog.${joinName}`,
        joinOid,
      };
      await expect(
        assertSafeFixtureTables(
          metadataOnlyProbe([entry, native, ...callbacks], "public.entry", undefined, [planned]),
          ["synthetic"],
        ),
      ).resolves.toBeUndefined();
      for (const variant of [
        { library: "$libdir/unreviewed" },
        { source: "opaque" },
        { owner: "unreviewed" },
        { oid: 999999 },
        { argumentTypes: ["pg_catalog.text"] },
      ])
        await expect(
          assertSafeFixtureTables(
            metadataOnlyProbe(
              [entry, native, { ...callbacks[0], ...variant }, callbacks[1]],
              "public.entry",
              undefined,
              [planned],
            ),
            ["synthetic"],
          ),
        ).rejects.toThrow();
      await expect(
        assertSafeFixtureTables(
          metadataOnlyProbe([entry, native, ...callbacks], "public.entry", undefined, [
            planned,
            { ...planned, implementation: "bridge.opaque" },
          ]),
          ["synthetic"],
        ),
      ).rejects.toThrow();
    }
  });
  test("stored core regex resolves through catalog dependencies without trusting custom regex implementations", async () => {
    const entry: FunctionProbe = {
      schema: "public",
      name: "entry",
      body: "RETURN NEW;",
      language: "plpgsql",
      system: false,
    };
    const operators: OperatorProbe[] = [
      {
        oid: 641,
        schema: "pg_catalog",
        name: "~",
        system: true,
        implementation: "pg_catalog.textregexeq",
      },
      {
        oid: 100001,
        schema: "public",
        name: "~",
        system: false,
        implementation: "public.unreviewed",
      },
    ];
    await expect(
      assertSafeFixtureTables(
        metadataOnlyProbe([entry], "public.entry", "fingerprint ~ '^[0-9a-f]{64}$'", operators, []),
        ["synthetic"],
      ),
    ).resolves.toBeUndefined();
    for (const [expression, dependencies] of [
      ["fingerprint OPERATOR(public.~) 'x'", [100001]],
      ["fingerprint ~ 'x'", [100001]],
      ["fingerprint ~ 'x'", [999999]],
    ] as const)
      await expect(
        assertSafeFixtureTables(
          metadataOnlyProbe([entry], "public.entry", expression, operators, [...dependencies]),
          ["synthetic"],
        ),
      ).rejects.toThrow();
  });
});
