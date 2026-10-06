import { describe, test, expect } from "bun:test";
import { assertGuardRawPreserved, type RawCloneState } from "./documentGuardPreservation";

// Pure byte-comparison fixtures; no native catalog observation or capability claim.
const empty = new Set<string>();
const baseRaw =
  '{"oid":"1259","relname":"pg_class","relnamespace":"11","relkind":"r","relowner":"10","relacl":null,"relrowsecurity":false,"relforcerowsecurity":false,"relfilenode":"0","reloptions":null,"relhastriggers":false,"relpages":10,"reltuples":20,"relallvisible":8,"relfrozenxid":"100","relminmxid":"1"}';
const framed = (raw: string, key = "pg_catalog.pg_class") =>
  Buffer.byteLength(key) + ":" + key + Buffer.byteLength(raw) + ":" + raw;
function state(raw = baseRaw): RawCloneState {
  return {
    database: "r01_clone_" + "a".repeat(32),
    databaseOid: "12345",
    backend: "7",
    actor: "supabase_admin",
    session: "supabase_admin",
    version: "170006",
    inventory: framed(raw),
    catalogs: {
      "pg_catalog.pg_class": [{ key: "0", raw }],
      "pg_catalog.pg_proc": [{ key: "0", raw: '{"oid":"9","prosrc":"original body"}' }],
    },
    rows: { "public.document_assets": [], "auth.users": [], "private.ledger": [] },
    sequences: { "public.example_seq": '{"last_value":1,"log_cnt":0,"is_called":false}' },
  };
}
const compare = (a: RawCloneState, b: RawCloneState) =>
  assertGuardRawPreserved(a, b, [], empty, empty);
const changed = (raw: string, field: string, value: unknown) => {
  const needle = '"' + field + '":' + JSON.stringify(JSON.parse(raw)[field]);
  if (!raw.includes(needle)) throw new Error("Missing exact test fixture field");
  return raw.replace(needle, '"' + field + '":' + JSON.stringify(value));
};
function refused(a: RawCloneState, b: RawCloneState) {
  try {
    compare(a, b);
    throw new Error("Logical drift accepted");
  } catch (e) {
    expect(e).toBeInstanceOf(Error);
    expect((e as Error & { code?: string }).code).toBe("55000");
  }
}
describe("finite pg_class maintenance scalar comparison", () => {
  test("identical original raw is a real raw no-op", () => {
    const r = compare(state(), state());
    expect(r.logicalPreserved).toBe(true);
    expect(r.rawEqual).toBe(true);
    expect(r.unaffectedRawEqual).toBe(true);
    expect(r.maintenanceDeltas).toEqual([]);
  });
  for (const [field, value] of [
    ["relpages", 11],
    ["reltuples", 21.5],
    ["relallvisible", 9],
    ["relfrozenxid", "101"],
    ["relminmxid", "2"],
  ] as const) {
    test("only " + field + " drift is reported in both encodings", () => {
      const r = compare(state(), state(changed(baseRaw, field, value)));
      expect(r.logicalPreserved).toBe(true);
      expect(r.rawEqual).toBe(false);
      expect(r.unaffectedRawEqual).toBe(false);
      expect(r.maintenanceDeltas.map((d) => d.encoding)).toEqual(["INVENTORY", "CATALOG"]);
      for (const d of r.maintenanceDeltas)
        expect(d.fields).toEqual([
          {
            field,
            beforeToken: JSON.stringify(JSON.parse(baseRaw)[field]),
            afterToken: JSON.stringify(value),
          },
        ]);
    });
  }
  test("all five counters can change with every retained byte identical", () => {
    let raw = baseRaw;
    for (const [f, v] of [
      ["relpages", 11],
      ["reltuples", 21],
      ["relallvisible", 9],
      ["relfrozenxid", "101"],
      ["relminmxid", "2"],
    ] as const)
      raw = changed(raw, f, v);
    const r = compare(state(), state(raw));
    expect(r.rawEqual).toBe(false);
    expect(r.maintenanceDeltas).toHaveLength(2);
    expect(r.maintenanceDeltas[0].fields).toHaveLength(5);
  });
  for (const [field, value] of [
    ["relacl", ["service_role=arwd/postgres"]],
    ["relrowsecurity", true],
    ["relforcerowsecurity", true],
    ["relowner", "16384"],
    ["oid", "8888"],
    ["relfilenode", "999"],
    ["reloptions", ["autovacuum_enabled=false"]],
    ["relhastriggers", true],
  ] as const) {
    test(field + " logical drift is denied even with counter drift", () =>
      refused(state(), state(changed(changed(baseRaw, "relpages", 11), field, value))),
    );
  }
  test("matching pg_catalog heap physical counters may vary", () => {
    const raw = baseRaw.replace('"1259"', '"1262"').replace('"pg_class"', '"pg_database"');
    const a = state(raw),
      b = state(changed(raw, "relpages", 11));
    a.inventory = framed(raw, "pg_catalog.pg_database");
    b.inventory = framed(b.catalogs["pg_catalog.pg_class"][0].raw, "pg_catalog.pg_database");
    expect(compare(a, b).maintenanceDeltas).toHaveLength(2);
  });
  test("actual pg_database datfrozenxid remains strict", () => {
    const a = state(),
      b = state();
    a.catalogs["pg_catalog.pg_database"] = [
      { key: "0", raw: '{"oid":"12345","datname":"r01_clone","datfrozenxid":"100"}' },
    ];
    b.catalogs["pg_catalog.pg_database"] = [
      { key: "0", raw: '{"oid":"12345","datname":"r01_clone","datfrozenxid":"101"}' },
    ];
    refused(a, b);
  });
  test("matching system index physical counters may vary", () => {
    const raw = baseRaw
      .replace('"1259"', '"2703"')
      .replace('"pg_class"', '"pg_type_oid_index"')
      .replace('"relkind":"r"', '"relkind":"i"');
    const a = state(),
      b = state();
    a.catalogs["pg_catalog.pg_class"][0].raw = raw;
    b.catalogs["pg_catalog.pg_class"][0].raw = changed(raw, "relpages", 11);
    const r = compare(a, b);
    expect(r.rawEqual).toBe(false);
    expect(r.maintenanceDeltas).toHaveLength(1);
    expect(r.maintenanceDeltas[0].encoding).toBe("CATALOG");
  });
  for (const [field, value] of [
    ["relname", "another_catalog"],
    ["relnamespace", "2200"],
    ["relkind", "i"],
  ] as const) {
    test(field + " identity change is denied", () =>
      refused(state(), state(changed(changed(baseRaw, "relpages", 11), field, value))),
    );
  }
  test("system view counters are not eligible", () => {
    const raw = changed(baseRaw, "relkind", "v");
    refused(state(raw), state(changed(raw, "relpages", 11)));
  });
  test("system index ACL drift remains denied", () => {
    const raw = baseRaw
      .replace('"1259"', '"2703"')
      .replace('"pg_class"', '"pg_type_oid_index"')
      .replace('"relkind":"r"', '"relkind":"i"');
    const a = state(),
      b = state();
    a.catalogs["pg_catalog.pg_class"][0].raw = raw;
    b.catalogs["pg_catalog.pg_class"][0].raw = changed(changed(raw, "relpages", 11), "relacl", [
      "service_role=r/postgres",
    ]);
    refused(a, b);
  });
  test("application relation counters remain strict", () => {
    const raw = baseRaw
      .replace('"1259"', '"8888"')
      .replace('"pg_class"', '"document_assets"')
      .replace('"11"', '"2200"');
    refused(state(raw), state(changed(raw, "relpages", 11)));
  });
  test("logical whitespace cannot be normalized away", () =>
    refused(
      state(),
      state(changed(baseRaw, "relpages", 11).replace('"relowner":', '"relowner" :')),
    ));
  test("nested counter-looking string cannot hide logical drift", () => {
    const a = baseRaw.replace('"reloptions":null', '"reloptions":["relpages:10"]');
    refused(state(a), state(changed(a, "relpages", 11).replace("relpages:10", "relpages:99")));
  });
  test("duplicate top-level scalar key is denied", () =>
    refused(
      state(),
      state(
        changed(baseRaw, "relpages", 11).replace('"relpages":11', '"relpages":11,"relpages":12'),
      ),
    ));
  test("unexpected quoted numeric encoding is denied", () =>
    refused(state(), state(changed(baseRaw, "relpages", "11"))));
  test("catalog encoding remains local and byte exact outside scalar values", () => {
    const before = state(),
      after = state(changed(baseRaw, "relpages", 11));
    before.catalogs["pg_catalog.pg_class"][0].raw = baseRaw.replaceAll('":', '": ');
    after.catalogs["pg_catalog.pg_class"][0].raw = changed(baseRaw, "relpages", 11).replaceAll(
      '":',
      '": ',
    );
    const r = compare(before, after);
    expect(r.rawEqual).toBe(false);
    expect(r.maintenanceDeltas).toHaveLength(2);
  });
  test("sequence values remain strict", () => {
    const b = state(changed(baseRaw, "relpages", 11));
    b.sequences["public.example_seq"] = '{"last_value":2,"log_cnt":0,"is_called":true}';
    refused(state(), b);
  });
  test("function bodies remain strict", () => {
    const b = state(changed(baseRaw, "relpages", 11));
    b.catalogs["pg_catalog.pg_proc"][0].raw = '{"oid":"9","prosrc":"changed body"}';
    refused(state(), b);
  });
  test("foreign actor remains strict", () => {
    const b = state();
    b.actor = "service_role";
    refused(state(), b);
  });
});
