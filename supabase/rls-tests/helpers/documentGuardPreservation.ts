import type { SQL } from "bun";
import { createHash } from "node:crypto";
import { assertCloneUrl } from "./productionSchemaClone";

/** Original server TEXT comparisons on one owned clone. No scalar/native capability mint. */
export type RawRow = { key: string; raw: string };
export type GuardObject = { classid: string; objid: string };
export type RawCloneState = {
  database: string;
  databaseOid: string;
  backend: string;
  actor: string;
  session: string;
  version: string;
  inventory: string;
  catalogs: Record<string, RawRow[]>;
  rows: Record<string, RawRow[]>;
  sequences: Record<string, string>;
};
const qi = (v: string) => '"' + v.replaceAll('"', '""') + '"';
const fingerprint = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const deny = (message: string): never => {
  throw Object.assign(new Error("55000 " + message), { code: "55000" });
};
const original = (v: unknown): string =>
  typeof v === "string" ? v : deny("Missing original server TEXT");
const frame = (rows: RawRow[]) =>
  rows
    .map((r) => `${Buffer.byteLength(r.key)}:${r.key}${Buffer.byteLength(r.raw)}:${r.raw}`)
    .join("");

// These catalogs contain credential-bearing fields. Their original value never crosses
// the connection: preserve a server SHA256 fingerprint alongside all nonsensitive fields.
const privateFields: Record<string, string[]> = {
  pg_authid: ["rolpassword"],
  pg_subscription: ["subconninfo"],
  pg_user_mapping: ["umoptions"],
  pg_foreign_server: ["srvoptions"],
  pg_foreign_table: ["ftoptions"],
};

/** Inventory every local catalog heap plus all non-TOAST application/Auth/ledger tables.
 * Views are covered by raw pg_class/pg_attribute/pg_rewrite/pg_depend, never evaluated.
 * Foreign tables are rejected before any read; no network-capable FDW operation.
 */
export async function captureGuardRawState(sql: SQL, url: string): Promise<RawCloneState> {
  assertCloneUrl(url);
  return sql.begin(async (tx) => {
    await tx`set transaction isolation level repeatable read read only`;
    await tx`set local lock_timeout='5s'`;
    await tx`set local statement_timeout='30s'`;
    const context = await tx`select current_database() as database,
      (select oid::text from pg_catalog.pg_database where datname=current_database()) as database_oid,pg_backend_pid()::text as backend,
      current_user as actor,session_user as session,current_setting('server_version_num') as version`;
    if (context.length !== 1) deny("Missing owning clone context");
    if (
      context[0].actor !== "supabase_admin" ||
      context[0].session !== "supabase_admin" ||
      typeof context[0].database !== "string" ||
      !/^r01_clone_[a-f0-9]{32}$/.test(context[0].database)
    )
      deny("Foreign snapshot context");
    const rawInventory =
      await tx`select n.nspname as schema,c.relname as name,c.relkind::text as kind,
      c.oid::text as oid,pg_catalog.to_jsonb(c)::text as raw
      from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where n.nspname not like 'pg_toast%' and n.nspname not like 'pg_temp_%'
        and n.nspname not like 'pg_toast_temp_%' and c.relkind in ('r','p','m','S','f')
      order by n.nspname collate "C",c.relname collate "C",c.oid`;
    if (rawInventory.some((r: { kind: unknown }) => r.kind === "f"))
      deny("Foreign table row preservation is unsupported");
    if (rawInventory.length > 1024) deny("Raw table inventory cap exceeded");
    const state: RawCloneState = {
      database: original(context[0].database),
      databaseOid: original(context[0].database_oid),
      backend: original(context[0].backend),
      actor: original(context[0].actor),
      session: original(context[0].session),
      version: original(context[0].version),
      inventory: frame(
        rawInventory.map((r: { schema: unknown; name: unknown; raw: unknown }) => ({
          key: original(r.schema) + "." + original(r.name),
          raw: original(r.raw),
        })),
      ),
      catalogs: {},
      rows: {},
      sequences: {},
    };
    for (const item of rawInventory) {
      const schema = original(item.schema),
        name = original(item.name),
        qualified = qi(schema) + "." + qi(name),
        key = schema + "." + name;
      if (item.kind === "S") {
        const values = await tx.unsafe(
          `select pg_catalog.row_to_json(s)::text as raw from (select last_value,log_cnt,is_called from ${qualified}) s`,
        );
        if (values.length !== 1) deny("Missing owning sequence state");
        state.sequences[key] = original(values[0].raw);
        continue;
      }
      if (schema === "auth" && name !== "schema_migrations") {
        const counts = await tx.unsafe(`select count(*)::text as count from ${qualified}`);
        if (counts.length !== 1 || counts[0].count !== "0")
          deny("Private Auth rows in schema-only clone");
        state.rows[key] = [];
        continue;
      }
      const secrets = schema === "pg_catalog" ? (privateFields[name] ?? []) : [];
      const projection =
        secrets.length === 0
          ? "pg_catalog.row_to_json(t)::text"
          : `(pg_catalog.to_jsonb(t)-array[${secrets.map((v) => "'" + v + "'").join(",")}])::text || ` +
            `' SHA256_PRIVATE_FIELDS=' || pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(` +
            `pg_catalog.jsonb_build_array(${secrets.map((v) => "t." + qi(v)).join(",")})::text,'UTF8')),'hex')`;
      const records = await tx.unsafe(
        `select ${projection} as raw from ${qualified} t order by (${projection}) collate "C"`,
      );
      if (records.length > 100000) deny("Raw row inventory cap exceeded");
      const rows: RawRow[] = records.map((r: { raw: unknown }, i: number) => ({
        key: String(i),
        raw: original(r.raw),
      }));
      if (rows.some((r) => Buffer.byteLength(r.raw) > 1048576)) deny("Raw row byte cap exceeded");
      (schema === "pg_catalog" ? state.catalogs : state.rows)[key] = rows;
    }
    return state;
  });
}

const parsed = (row: RawRow): Record<string, unknown> => {
  const v: unknown = JSON.parse(row.raw);
  if (v === null || typeof v !== "object" || Array.isArray(v)) deny("Bad raw catalog row");
  return v as Record<string, unknown>;
};
const owns = (objects: GuardObject[], classid: unknown, objid: unknown) =>
  typeof classid === "string" &&
  typeof objid === "string" &&
  objects.some((o) => o.classid === classid && o.objid === objid);

export type MaintenanceDelta = {
  encoding: "INVENTORY" | "CATALOG";
  relation: string;
  oid: string;
  beforeSha256: string;
  afterSha256: string;
  fields: { field: string; beforeToken: string; afterToken: string }[];
};
export type PreservationResult = {
  logicalPreserved: true;
  rawEqual: boolean;
  unaffectedRawEqual: boolean;
  maintenanceDeltas: MaintenanceDelta[];
};
// Matching pg_catalog heap/index identities may have physical maintenance drift.
// Only the five scalar spans below differ; every other original byte stays exact.
const counterFields = [
  "relpages",
  "reltuples",
  "relallvisible",
  "relfrozenxid",
  "relminmxid",
] as const;
/** Replace only exact top-level scalar token spans; all other original server TEXT,
 * including whitespace, field order, ACL/body bytes and nested strings, stays exact.
 * This handles inventory to_jsonb and catalog row_to_json encodings separately.
 */
function maintenanceView(raw: string) {
  const row = parsed({ key: "", raw }),
    name = row.relname,
    oid = row.oid;
  if (
    typeof name !== "string" ||
    name.length === 0 ||
    typeof oid !== "string" ||
    !/^[1-9][0-9]*$/.test(oid) ||
    row.relnamespace !== "11" ||
    (row.relkind !== "r" && row.relkind !== "i")
  )
    return { text: raw, relation: null, tokens: new Map<string, string>() };
  const pattern =
    /"(?:[^"\\]|\\.)*"|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?|true|false|null|[{}[\],:]|\s+/g;
  const tokens = [...raw.matchAll(pattern)].filter((m) => !/^\s+$/.test(m[0]));
  let cursor = 0;
  for (const m of raw.matchAll(pattern)) {
    if (m.index !== cursor) deny("Malformed pg_class original token stream");
    cursor += m[0].length;
  }
  if (cursor !== raw.length) deny("Incomplete pg_class original token stream");
  const keys = new Set<string>(),
    spans: { start: number; end: number; field: string; token: string }[] = [];
  let depth = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i][0];
    if (t === "{" || t === "[") {
      depth++;
      continue;
    }
    if (t === "}" || t === "]") {
      depth--;
      continue;
    }
    if (
      depth !== 1 ||
      !t.startsWith('"') ||
      tokens[i + 1]?.[0] !== ":" ||
      (tokens[i - 1]?.[0] !== "{" && tokens[i - 1]?.[0] !== ",")
    )
      continue;
    const field: unknown = JSON.parse(t);
    if (typeof field !== "string") return deny("Duplicate pg_class original key");
    if (keys.has(field)) deny("Duplicate pg_class original key");
    keys.add(field);
    if (!counterFields.some((f) => f === field)) continue;
    const value = tokens[i + 2];
    if (!value || value.index === undefined) deny("Missing pg_class maintenance token");
    const token = value[0],
      quoted = field === "relfrozenxid" || field === "relminmxid";
    if (
      quoted
        ? !/^"(0|[1-9][0-9]*)"$/.test(token)
        : field === "reltuples"
          ? !/^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$/.test(token)
          : !/^(0|[1-9][0-9]*)$/.test(token)
    )
      deny("Unexpected pg_class maintenance scalar encoding");
    spans.push({ start: value.index, end: value.index + token.length, field, token });
  }
  if (spans.length !== 5 || counterFields.some((f) => !spans.some((s) => s.field === f)))
    deny("Incomplete finite maintenance fields");
  let text = "",
    at = 0;
  for (const s of spans) {
    text += raw.slice(at, s.start) + "@" + s.field + "@";
    at = s.end;
  }
  text += raw.slice(at);
  return {
    text,
    relation: { name, oid: String(oid) },
    tokens: new Map(spans.map((s) => [s.field, s.token])),
  };
}
function comparePgClass(
  left: RawRow[],
  right: RawRow[],
  encoding: "INVENTORY" | "CATALOG",
  deltas: MaintenanceDelta[],
): boolean {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i++) {
    if (encoding === "INVENTORY" && left[i].key !== right[i].key) return false;
    if (left[i].raw === right[i].raw) continue;
    const a = maintenanceView(left[i].raw),
      b = maintenanceView(right[i].raw);
    if (
      a.text !== b.text ||
      !a.relation ||
      !b.relation ||
      a.relation.name !== b.relation.name ||
      a.relation.oid !== b.relation.oid ||
      (encoding === "INVENTORY" && left[i].key !== "pg_catalog." + a.relation.name)
    )
      return false;
    const fields = counterFields
      .filter((f) => a.tokens.get(f) !== b.tokens.get(f))
      .map((field) => ({
        field,
        beforeToken: a.tokens.get(field)!,
        afterToken: b.tokens.get(field)!,
      }));
    deltas.push({
      encoding,
      relation: "pg_catalog." + a.relation.name,
      oid: a.relation.oid,
      beforeSha256: fingerprint(left[i].raw),
      afterSha256: fingerprint(right[i].raw),
      fields,
    });
  }
  return true;
}

/** Caller must first validate the exact current named raw contracts/dependency closure.
 * Only the nine admitted object rows and their measured dependency edges may be removed.
 * Raw row ordinals are not object identity; equality retains ordering/multiplicity.
 */
export function assertGuardRawPreserved(
  before: RawCloneState,
  after: RawCloneState,
  admitted: GuardObject[],
  expectedDependencyRows: ReadonlySet<string>,
  expectedOwnerRows: ReadonlySet<string>,
): PreservationResult {
  const maintenanceDeltas: MaintenanceDelta[] = [];
  let unaffectedRawEqual = before.inventory === after.inventory;
  if (
    before.actor !== "supabase_admin" ||
    after.actor !== "supabase_admin" ||
    before.session !== "supabase_admin" ||
    after.session !== "supabase_admin" ||
    before.database !== after.database ||
    before.databaseOid !== after.databaseOid ||
    before.backend !== after.backend ||
    before.actor !== after.actor ||
    before.session !== after.session ||
    before.version !== after.version
  )
    deny("Snapshot owning context changed");
  if (before.inventory !== after.inventory) {
    // Decode only the exact length-prefixed original pg_class inventory strings.
    // Retain every original byte; only the five measured scalar spans may differ logically.
    const inventoryRows = (frame: string): RawRow[] => {
      const bytes = Buffer.from(frame, "utf8"),
        rows: RawRow[] = [];
      let at = 0;
      const part = (): string => {
        const colon = bytes.indexOf(58, at);
        if (colon < at || colon - at > 10) deny("Malformed original inventory frame");
        const digits = bytes.subarray(at, colon).toString("ascii");
        if (!/^(0|[1-9][0-9]*)$/.test(digits)) deny("Malformed original inventory length");
        const size = Number(digits);
        at = colon + 1;
        if (!Number.isSafeInteger(size) || size > 1048576 || at + size > bytes.length)
          deny("Original inventory range");
        const raw = bytes.subarray(at, at + size);
        at += size;
        const text = raw.toString("utf8");
        if (!Buffer.from(text, "utf8").equals(raw)) deny("Original inventory UTF8 mismatch");
        return text;
      };
      while (at < bytes.length) {
        if (rows.length >= 1024) deny("Original inventory row cap");
        rows.push({ key: part(), raw: part() });
      }
      return rows;
    };
    const a = inventoryRows(before.inventory),
      b = inventoryRows(after.inventory);
    const subtract = (left: RawRow[], right: RawRow[]) => {
      const counts = new Map<string, number>();
      for (const r of right) {
        const k = JSON.stringify([r.key, r.raw]);
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      return left.filter((r) => {
        const k = JSON.stringify([r.key, r.raw]),
          n = counts.get(k) ?? 0;
        if (n === 0) return true;
        counts.set(k, n - 1);
        return false;
      });
    };
    if (!comparePgClass(a, b, "INVENTORY", maintenanceDeltas)) {
      const removed = subtract(a, b),
        added = subtract(b, a);
      const evidence = (r: RawRow) => ({
        relation: r.key,
        bytes: Buffer.byteLength(r.raw),
        sha256: fingerprint(r.raw),
        originalServerText: Buffer.byteLength(r.raw) <= 8192 ? r.raw : null,
      });
      throw Object.assign(new Error("55000 Table/sequence inventory or raw relation changed"), {
        code: "55000",
        preservationDrift: {
          table: "pg_catalog.pg_class",
          phase: "TABLE_SEQUENCE_INVENTORY",
          beforeRows: a.length,
          afterRows: b.length,
          removedCount: removed.length,
          addedCount: added.length,
          removed: removed.slice(0, 16).map(evidence),
          added: added.slice(0, 16).map(evidence),
          bounded:
            removed.length > 16 ||
            added.length > 16 ||
            [...removed, ...added].some((r) => Buffer.byteLength(r.raw) > 8192),
        },
      });
    }
  }
  if (admitted.length !== 0 && admitted.length !== 9)
    deny("Exact nine native object rows required");
  if (
    admitted.length === 9 &&
    (new Set(admitted.map((o) => o.classid + ":" + o.objid)).size !== 9 ||
      ["1255", "2620", "2606"].some((c) => admitted.filter((o) => o.classid === c).length !== 3) ||
      expectedDependencyRows.size !== 18 ||
      expectedOwnerRows.size !== 3)
  )
    deny("Bad finite object/dependency inventory");
  const strip = (table: string, rows: RawRow[]) =>
    rows
      .filter((row) => {
        if (
          table === "pg_catalog.pg_proc" ||
          table === "pg_catalog.pg_trigger" ||
          table === "pg_catalog.pg_constraint"
        ) {
          const classid =
            table === "pg_catalog.pg_proc"
              ? "1255"
              : table === "pg_catalog.pg_trigger"
                ? "2620"
                : "2606";
          return !owns(admitted, classid, parsed(row).oid);
        }
        if (table === "pg_catalog.pg_depend") {
          const v = parsed(row),
            affected =
              owns(admitted, v.classid, v.objid) || owns(admitted, v.refclassid, v.refobjid);
          if (!affected) return true;
          if (!expectedDependencyRows.has(row.raw)) deny("Unmeasured named-object dependency");
          return false;
        }
        if (table === "pg_catalog.pg_shdepend") {
          const v = parsed(row);
          if (v.dbid !== after.databaseOid || !owns(admitted, v.classid, v.objid)) return true;
          if (!expectedOwnerRows.has(row.raw)) deny("Unmeasured named-object shared dependency");
          return false;
        }
        return true;
      })
      .map((row) => row.raw);
  for (const section of ["catalogs", "rows", "sequences"] as const) {
    const a = before[section],
      b = after[section];
    if (JSON.stringify(Object.keys(a).sort()) !== JSON.stringify(Object.keys(b).sort()))
      deny("Preservation inventory changed: " + section);
    for (const key of Object.keys(a)) {
      const left = section === "catalogs" ? strip(key, before.catalogs[key]) : a[key];
      const right = section === "catalogs" ? strip(key, after.catalogs[key]) : b[key];
      const rawSame = JSON.stringify(left) === JSON.stringify(right);
      unaffectedRawEqual = unaffectedRawEqual && rawSame;
      if (
        !rawSame &&
        !(
          section === "catalogs" &&
          key === "pg_catalog.pg_class" &&
          comparePgClass(before.catalogs[key], after.catalogs[key], "CATALOG", maintenanceDeltas)
        )
      ) {
        if (section === "catalogs" && key === "pg_catalog.pg_class") {
          // This exact nonprivate catalog failed in the first role regression.
          // Retain original server row strings, not a guessed cause or an exemption.
          const a = before.catalogs[key],
            b = after.catalogs[key],
            aSet = new Set(a.map((r) => r.raw)),
            bSet = new Set(b.map((r) => r.raw));
          const removed = a.filter((r) => !bSet.has(r.raw)),
            added = b.filter((r) => !aSet.has(r.raw));
          const evidence = (r: RawRow) => ({
            bytes: Buffer.byteLength(r.raw),
            sha256: fingerprint(r.raw),
            originalServerText: Buffer.byteLength(r.raw) <= 8192 ? r.raw : null,
          });
          throw Object.assign(new Error("55000 Unrelated raw preservation drift: " + key), {
            code: "55000",
            preservationDrift: {
              table: key,
              beforeRows: a.length,
              afterRows: b.length,
              removedCount: removed.length,
              addedCount: added.length,
              removed: removed.slice(0, 16).map(evidence),
              added: added.slice(0, 16).map(evidence),
              bounded:
                removed.length > 16 ||
                added.length > 16 ||
                [...removed, ...added].some((r) => Buffer.byteLength(r.raw) > 8192),
            },
          });
        }
        deny("Unrelated raw preservation drift: " + key);
      }
    }
  }
  const rawEqual =
    before.inventory === after.inventory &&
    (["catalogs", "rows", "sequences"] as const).every(
      (s) => JSON.stringify(before[s]) === JSON.stringify(after[s]),
    );
  return { logicalPreserved: true, rawEqual, unaffectedRawEqual, maintenanceDeltas };
}

export function rawStateDigests(state: RawCloneState) {
  return {
    context: {
      database: state.database,
      databaseOid: state.databaseOid,
      backend: state.backend,
      actor: state.actor,
      session: state.session,
      version: state.version,
    },
    inventory: fingerprint(state.inventory),
    catalogs: Object.fromEntries(
      Object.entries(state.catalogs).map(([k, v]) => [
        k,
        { rows: v.length, sha256: fingerprint(frame(v)) },
      ]),
    ),
    rows: Object.fromEntries(
      Object.entries(state.rows).map(([k, v]) => [
        k,
        { rows: v.length, sha256: fingerprint(frame(v)) },
      ]),
    ),
    sequences: Object.fromEntries(
      Object.entries(state.sequences).map(([k, v]) => [k, fingerprint(v)]),
    ),
  };
}
