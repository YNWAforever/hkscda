import { createHash } from "node:crypto";
import {
  assertDocumentTestTarget,
  documentTestActor,
  type DocumentTestTarget,
} from "./documentGuardTestTarget";

const functions = [
  "enforce_published_site_document_slot_asset",
  "enforce_published_knowledge_document_assets",
  "protect_published_document_references",
  "touch_document_publication_fence",
  "coordinate_annual_report_publication",
  "coordinate_annual_asset_change",
  "enforce_annual_report_asset",
  "protect_published_annual_report_asset",
  "mutate_document_asset_with_audit",
  "mutate_annual_report_with_audit",
];

/** Second strengthening application must preserve actual catalog identities,
 * definitions, ACL/defaults and dependency rows. Original server strings remain
 * in memory; only their digest and counts are returned to the test runner.
 */
export async function documentPublicationFenceNoOp(clone: DocumentTestTarget, migration: string) {
  await assertDocumentTestTarget(clone);
  if (Buffer.byteLength(migration) > 262144) throw Error("Compact fence migration cap exceeded");
  const capture = () =>
    clone.sql.begin(async (tx) => {
      await tx`set transaction isolation level repeatable read read only`;
      const context =
        await tx`select current_user actor,session_user session,current_database() database`;
      if (
        context.length !== 1 ||
        context[0].actor !== documentTestActor(clone) ||
        context[0].session !== documentTestActor(clone) ||
        context[0].database !== clone.name
      )
        throw Error("Fence no-op snapshot context mismatch");
      return tx.unsafe(
        `with relations as (
      select c.oid from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where n.nspname='private' and c.relname='document_publication_fences'
    ), procedures as (
      select p.oid from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
      where n.nspname in ('private','public') and p.proname in(select pg_catalog.jsonb_array_elements_text($1::text::jsonb))
    ), constraints as (
      select c.oid from pg_catalog.pg_constraint c where c.conrelid in(select oid from relations)
        or c.conname in ('enforce_published_site_document_slot_asset','enforce_published_knowledge_document_assets','protect_published_document_references')
    ), indexes as (
      select i.indexrelid oid from pg_catalog.pg_index i where i.indrelid in(select oid from relations)
    ), hooks as (
      select t.oid from pg_catalog.pg_trigger t where t.tgrelid in(select oid from relations)
        or t.tgconstraint in(select oid from constraints)
        or t.tgname in ('zz_coordinate_annual_report_publication','aa_coordinate_annual_asset_change',
          'enforce_published_site_document_slot_asset','enforce_published_knowledge_document_assets','protect_published_document_references')
    ), objects as (
      select 'pg_catalog.pg_class'::regclass::oid classid,oid objid from relations
      union all select 'pg_catalog.pg_class'::regclass::oid,oid from indexes
      union all select 'pg_catalog.pg_proc'::regclass::oid,oid from procedures
      union all select 'pg_catalog.pg_trigger'::regclass::oid,oid from hooks
      union all select 'pg_catalog.pg_constraint'::regclass::oid,oid from constraints
    ), rows as (
      select 'relation' family,c.oid::text identity,row_to_json(c)::text raw from pg_catalog.pg_class c where c.oid in(select oid from relations)
      union all select 'index_relation',c.oid::text,row_to_json(c)::text from pg_catalog.pg_class c where c.oid in(select oid from indexes)
      union all select 'index',i.indexrelid::text,row_to_json(i)::text from pg_catalog.pg_index i where i.indexrelid in(select oid from indexes)
      union all select 'column',a.attrelid::text||':'||a.attnum::text,row_to_json(a)::text from pg_catalog.pg_attribute a where a.attrelid in(select oid from relations)
      union all select 'default',d.oid::text,row_to_json(d)::text from pg_catalog.pg_attrdef d where d.adrelid in(select oid from relations)
      union all select 'policy',p.oid::text,row_to_json(p)::text from pg_catalog.pg_policy p where p.polrelid in(select oid from relations)
      union all select 'function',p.oid::text,row_to_json(p)::text from pg_catalog.pg_proc p where p.oid in(select oid from procedures)
      union all select 'definition',p.oid::text,pg_catalog.pg_get_functiondef(p.oid) from pg_catalog.pg_proc p where p.oid in(select oid from procedures)
      union all select 'trigger',t.oid::text,row_to_json(t)::text from pg_catalog.pg_trigger t where t.oid in(select oid from hooks)
      union all select 'constraint',c.oid::text,row_to_json(c)::text from pg_catalog.pg_constraint c where c.oid in(select oid from constraints)
      union all select 'dependency',row_to_json(d)::text,row_to_json(d)::text from pg_catalog.pg_depend d
        where exists(select 1 from objects o where (d.classid=o.classid and d.objid=o.objid) or (d.refclassid=o.classid and d.refobjid=o.objid))
      union all select 'shared_dependency',row_to_json(d)::text,row_to_json(d)::text from pg_catalog.pg_shdepend d
        where d.dbid=(select oid from pg_catalog.pg_database where datname=current_database())
          and exists(select 1 from objects o where d.classid=o.classid and d.objid=o.objid)
    ) select family,identity,raw from rows order by family collate "C",identity collate "C",raw collate "C"`,
        [JSON.stringify(functions)],
      );
    });
  const before = await capture();
  if (
    before.filter((r: { family: string }) => r.family === "function").length !== 10 ||
    before.filter((r: { family: string }) => r.family === "relation").length !== 1
  )
    throw Error("Complete strengthening installation required before idempotence check");
  await clone.sql.begin(async (tx) => {
    await tx`set local lock_timeout='5s'`;
    await tx`set local statement_timeout='30s'`;
    await tx`set local role postgres`;
    await tx.unsafe(migration);
  });
  const after = await capture();
  if (JSON.stringify(before) !== JSON.stringify(after))
    throw Error("Second strengthening changed original named catalog/ACL/dependency identities");
  return {
    namedRawEqual: true,
    rows: before.length,
    sha256: createHash("sha256").update(JSON.stringify(before)).digest("hex"),
  };
}
