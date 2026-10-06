import { expect, test } from "bun:test";
import { SQL } from "bun";
import { assertSafeFixtureTables } from "./productionSchemaClone";

// Proposed catalog-only fixtures: no connection, function execution or network.
type Row = Record<string, unknown>;
type Fixture = { functions: Row[]; operator: Row; aggregateMetadata: Row };
function capturedAggregate(name: "min" | "max"): Fixture {
  const minimum = name === "min",
    callback = minimum ? "citext_smaller" : "citext_larger";
  const nativeAcl = [
    "PUBLIC",
    "anon",
    "authenticated",
    "postgres",
    "service_role",
    "supabase_admin",
  ].map((grantee) => ({
    grantor: "supabase_admin",
    grantee,
    privilege: "EXECUTE",
    grantable: false,
  }));
  const common = {
    schema: "public",
    system: false,
    owner: "supabase_admin",
    extension: "citext",
    extensionVersion: "1.6",
    extensionOwner: "supabase_admin",
    extensionSchema: "public",
    membership: "e",
    config: null,
    definer: false,
    defaults: 0,
    defaultExpression: null,
    nativeAcl,
    volatility: "i",
    parallel: "s",
    leakproof: false,
    cost: 1,
    rows: 0,
    support: 0,
    returnsSet: false,
    variadic: 0,
    transforms: null,
    allArgumentTypes: null,
    argumentModes: null,
    argumentNames: null,
    sqlBody: null,
  };
  const native = {
    ...common,
    oid: 100001,
    name: callback,
    kind: "f",
    body: "",
    language: "c",
    source: callback,
    library: "$libdir/citext",
    arguments: 2,
    argumentTypes: ["public.citext", "public.citext"],
    result: "citext",
    resultType: "public.citext",
    strict: true,
    aggregation: null,
  };
  const sorter = {
    ...native,
    oid: 100003,
    name: minimum ? "citext_lt" : "citext_gt",
    source: minimum ? "citext_lt" : "citext_gt",
    result: "boolean",
    resultType: "pg_catalog.bool",
  };
  const operator = {
    oid: 100004,
    schema: "public",
    name: minimum ? "<" : ">",
    system: false,
    owner: "supabase_admin",
    leftType: "public.citext",
    rightType: "public.citext",
    implementation: "public." + sorter.name,
    implementationOid: sorter.oid,
    restriction: minimum ? "pg_catalog.scalarltsel" : "pg_catalog.scalargtsel",
    restrictionOid: minimum ? 103 : 104,
    join: minimum ? "pg_catalog.scalarltjoinsel" : "pg_catalog.scalargtjoinsel",
    joinOid: minimum ? 107 : 108,
  };
  const aggregateMetadata = {
    kind: "n",
    directArguments: 0,
    transition: native.oid,
    combine: native.oid,
    final: 0,
    serial: 0,
    deserial: 0,
    movingTransition: 0,
    movingInverseTransition: 0,
    movingFinal: 0,
    finalExtra: false,
    movingFinalExtra: false,
    finalModify: "r",
    movingFinalModify: "r",
    sortOperator: operator.oid,
    transitionType: "public.citext",
    transitionSpace: 0,
    movingTransitionType: null,
    movingTransitionSpace: 0,
    initial: null,
    movingInitial: null,
  };
  const aggregate = {
    ...common,
    oid: 100002,
    name,
    kind: "a",
    body: "",
    language: "internal",
    source: "aggregate_dummy",
    library: null,
    arguments: 1,
    argumentTypes: ["public.citext"],
    result: "citext",
    resultType: "public.citext",
    strict: false,
    aggregation: aggregateMetadata,
  };
  const entry = {
    schema: "public",
    name: "synthetic_entry",
    body: `SELECT ${name}(value);`,
    language: "sql",
    system: false,
  };
  const planner = (join: boolean): Row => {
    const plannerName = join ? operator.join.slice(11) : operator.restriction.slice(11);
    return {
      oid: join ? operator.joinOid : operator.restrictionOid,
      schema: "pg_catalog",
      name: plannerName,
      body: "",
      system: true,
      language: "internal",
      source: plannerName,
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
    };
  };
  return {
    functions: [entry, native, aggregate, sorter, planner(false), planner(true)],
    operator,
    aggregateMetadata,
  };
}
function catalogProbe(fixture: Fixture) {
  const probe = {
    unsafe: async (query: string) => {
      if (query.includes("pg_proc p join")) return fixture.functions;
      if (query.includes("pg_operator o join")) return [fixture.operator];
      if (query.includes("pg_trigger t join"))
        return [{ table_name: "public.synthetic", function_name: "public.synthetic_entry" }];
      if (query.includes("pg_attrdef") || query === "set local search_path=pg_catalog") return [];
      throw new Error("Unexpected pure metadata query");
    },
    begin: async (run: (tx: unknown) => Promise<unknown>) => run(probe),
  };
  return probe as unknown as SQL;
}
const commonDrifts: [string, unknown][] = [
  ["schema", "bridge"],
  ["owner", "postgres"],
  ["extension", "other"],
  ["extensionVersion", "9.9"],
  ["extensionOwner", "postgres"],
  ["extensionSchema", "bridge"],
  ["membership", "a"],
  ["definer", true],
  ["config", ["search_path=bridge"]],
  ["defaults", 1],
  ["defaultExpression", "NULL::citext"],
  ["volatility", "v"],
  ["parallel", "u"],
  ["leakproof", true],
  ["cost", 100],
  ["rows", 1],
  ["support", 999999],
  ["returnsSet", true],
  ["variadic", 999999],
  ["transforms", [999999]],
  ["allArgumentTypes", [999999]],
  ["argumentModes", ["v"]],
  ["argumentNames", ["value"]],
  ["sqlBody", "unreviewed"],
  ["nativeAcl", []],
];
for (const name of ["min", "max"] as const) {
  test(`captured citext ${name} aggregate remains a pure fixture path`, async () => {
    await expect(
      assertSafeFixtureTables(catalogProbe(capturedAggregate(name)), ["synthetic"]),
    ).resolves.toBeUndefined();
  });
  for (const [label, index] of [
    ["aggregate", 2],
    ["transition", 1],
    ["sort callback", 3],
  ] as const) {
    for (const [facet, value] of [
      ...commonDrifts,
      ["kind", "p"],
      ["language", "sql"],
      ["source", "opaque"],
      ["library", "$libdir/opaque"],
      ["arguments", 9],
      ["argumentTypes", ["pg_catalog.text"]],
      ["resultType", "pg_catalog.text"],
      ["strict", index === 2],
    ] as [string, unknown][]) {
      test(`${name} rejects ${label} ${facet} drift`, async () => {
        const f = structuredClone(capturedAggregate(name));
        f.functions[index][facet] = value;
        await expect(assertSafeFixtureTables(catalogProbe(f), ["synthetic"])).rejects.toThrow();
      });
    }
    for (const facet of [
      "unknown recipient",
      "grant option",
      "grantor",
      "missing recipient",
      "duplicate recipient",
      "wrong privilege",
    ]) {
      test(`${name} rejects ${label} ACL ${facet}`, async () => {
        const f = structuredClone(capturedAggregate(name));
        const entries = f.functions[index].nativeAcl as Row[];
        if (facet === "unknown recipient")
          entries.push({
            grantor: "supabase_admin",
            grantee: "dashboard_user",
            privilege: "EXECUTE",
            grantable: false,
          });
        if (facet === "grant option") entries[0].grantable = true;
        if (facet === "grantor") entries[0].grantor = "postgres";
        if (facet === "missing recipient") entries.pop();
        if (facet === "duplicate recipient") entries[0].grantee = entries[1].grantee;
        if (facet === "wrong privilege") entries[0].privilege = "SELECT";
        await expect(assertSafeFixtureTables(catalogProbe(f), ["synthetic"])).rejects.toThrow();
      });
    }
  }
  for (const [facet, value] of [
    ["kind", "o"],
    ["directArguments", 1],
    ["transition", 999999],
    ["combine", 999999],
    ["final", 999999],
    ["serial", 999999],
    ["deserial", 999999],
    ["movingTransition", 999999],
    ["movingInverseTransition", 999999],
    ["movingFinal", 999999],
    ["finalExtra", true],
    ["movingFinalExtra", true],
    ["finalModify", "w"],
    ["movingFinalModify", "w"],
    ["sortOperator", 999999],
    ["transitionType", "pg_catalog.text"],
    ["transitionSpace", 1],
    ["movingTransitionType", "public.citext"],
    ["movingTransitionSpace", 1],
    ["initial", "seed"],
    ["movingInitial", "seed"],
  ] as [string, unknown][]) {
    test(`${name} rejects aggregate ${facet} drift`, async () => {
      const f = structuredClone(capturedAggregate(name));
      f.aggregateMetadata[facet] = value;
      await expect(assertSafeFixtureTables(catalogProbe(f), ["synthetic"])).rejects.toThrow();
    });
  }
  for (const [facet, value] of [
    ["schema", "bridge"],
    ["owner", "postgres"],
    ["name", "##"],
    ["leftType", "pg_catalog.text"],
    ["rightType", "pg_catalog.text"],
    ["implementation", "bridge.opaque"],
    ["implementationOid", 999999],
    ["restriction", "bridge.opaque"],
    ["restrictionOid", 999999],
    ["join", "bridge.opaque"],
    ["joinOid", 999999],
  ] as [string, unknown][]) {
    test(`${name} rejects sort operator ${facet} drift`, async () => {
      const f = structuredClone(capturedAggregate(name));
      f.operator[facet] = value;
      await expect(assertSafeFixtureTables(catalogProbe(f), ["synthetic"])).rejects.toThrow();
    });
  }
  test(`${name} rejects absent aggregate metadata and missing callback`, async () => {
    const f = structuredClone(capturedAggregate(name));
    f.functions[2].aggregation = null;
    await expect(assertSafeFixtureTables(catalogProbe(f), ["synthetic"])).rejects.toThrow();
    const g = structuredClone(capturedAggregate(name));
    g.functions.splice(1, 1);
    await expect(assertSafeFixtureTables(catalogProbe(g), ["synthetic"])).rejects.toThrow();
  });
  test(`${name} refuses unknown native aggregate even beside a captured aggregate`, async () => {
    const f = structuredClone(capturedAggregate(name));
    f.functions[0].body = "SELECT bridge.opaque(value);";
    f.functions.push({ ...f.functions[2], oid: 999999, schema: "bridge", name: "opaque" });
    await expect(assertSafeFixtureTables(catalogProbe(f), ["synthetic"])).rejects.toThrow();
  });
  for (const body of [
    "PERFORM net.http_post('https://example.invalid');",
    "PERFORM extensions.http_head('https://example.invalid');",
    "PERFORM bridge.provider();",
  ]) {
    test(`${name} direct or transitive provider path remains refused: ${body}`, async () => {
      const f = structuredClone(capturedAggregate(name));
      f.functions[0].body = body;
      f.functions.push({
        schema: "bridge",
        name: "provider",
        body: "PERFORM net.http_post('https://example.invalid');",
        language: "plpgsql",
        system: false,
      });
      await expect(assertSafeFixtureTables(catalogProbe(f), ["synthetic"])).rejects.toThrow();
    });
  }
}
