/** Test-only comparison of the approved five-column ACL boundary. */
import { SQL } from "bun";
import { hash, type Catalog } from "./productionSchemaClone";

const controlColumns: Record<string, string[]> = {
  donation: ["idempotency_key", "idempotency_fingerprint"],
  payment: ["idempotency_key", "checkout_url", "checkout_attempted_at"],
};
type Entry = { grantor: string; grantee: string; privilege: string; grantable: boolean };
type Relation = { schema: string; name: string; acl: Entry[] };
type Column = { schema: string; table: string; name: string; acl: Entry[] };
const converted = (entry: Entry) =>
  entry.grantor === "postgres" &&
  ["PUBLIC", "anon", "authenticated"].includes(entry.grantee) &&
  ["INSERT", "UPDATE"].includes(entry.privilege);
const targetTable = (schema: string, name: string) => schema === "public" && !!controlColumns[name];

export async function oldColumnRights(db: SQL) {
  return db.unsafe(`select c.relname "table",a.attname "column",r.rolname role,p.privilege,
    pg_catalog.has_column_privilege(r.oid,c.oid,a.attnum,p.privilege) allowed,
    pg_catalog.has_column_privilege(r.oid,c.oid,a.attnum,p.privilege||' WITH GRANT OPTION') grantable
    from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
    join pg_catalog.pg_attribute a on a.attrelid=c.oid and a.attnum>0 and not a.attisdropped
    cross join pg_catalog.pg_roles r cross join (values('SELECT'),('INSERT'),('UPDATE'),('REFERENCES')) p(privilege)
    where n.nspname='public' and c.relname in ('donation','payment')
    and not (c.relname='donation' and a.attname in ('idempotency_key','idempotency_fingerprint')
      or c.relname='payment' and a.attname in ('idempotency_key','checkout_url','checkout_attempted_at'))
    order by c.relname,a.attnum,r.rolname,p.privilege`);
}

export function assertPaymentAclConversion(before: Catalog, after: Catalog) {
  const priorRelations = before.relations as Relation[];
  const currentRelations = after.relations as Relation[];
  const normalizeRelations = (relations: Relation[]) =>
    relations
      .filter(
        (r) => !["donation_idempotency_key_idx", "payment_idempotency_key_idx"].includes(r.name),
      )
      .map((r) => ({
        ...r,
        acl: targetTable(r.schema, r.name) ? r.acl.filter((a) => !converted(a)) : r.acl,
      }));
  if (hash(normalizeRelations(priorRelations)) !== hash(normalizeRelations(currentRelations)))
    throw new Error("Unapproved relation metadata/ACL drift");
  for (const r of currentRelations.filter((r) => targetTable(r.schema, r.name)))
    if (r.acl.some(converted))
      throw new Error("Public table-level control-column authority remains");

  const currentColumns = after.columns as Column[];
  for (const c of before.columns as Column[]) {
    if (targetTable(c.schema, c.table) && controlColumns[c.table].includes(c.name)) continue;
    const actual = currentColumns.find(
      (a) => a.schema === c.schema && a.table === c.table && a.name === c.name,
    );
    if (!actual) throw new Error("Original column removed");
    const added = targetTable(c.schema, c.table)
      ? priorRelations
          .find((r) => r.schema === c.schema && r.name === c.table)!
          .acl.filter(converted)
      : [];
    // PostgreSQL merges identical grantor/grantee/privilege entries by strongest grant option.
    const expected = new Map<string, Entry>();
    for (const e of [...c.acl, ...added]) {
      const key = [e.grantor, e.grantee, e.privilege].join("/");
      expected.set(key, { ...e, grantable: e.grantable || !!expected.get(key)?.grantable });
    }
    const ordered = (entries: Entry[]) =>
      entries.sort((a, b) =>
        [a.grantor, a.grantee, a.privilege]
          .join("/")
          .localeCompare([b.grantor, b.grantee, b.privilege].join("/")),
      );
    if (
      hash({ ...c, acl: ordered([...expected.values()]) }) !==
      hash({ ...actual, acl: ordered([...actual.acl]) })
    )
      throw new Error(
        `Unapproved original column metadata/ACL drift: ${c.schema}.${c.table}.${c.name}`,
      );
  }
}
