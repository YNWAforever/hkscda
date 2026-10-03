import { tables, names, functionsQuery, authQuery, nativeQuery, indexDetailsQuery, shapesQuery } from "./task-12-profile";
import { catalogQuery } from "../../../../supabase/rls-tests/helpers/productionSchemaClone";
export const globalKeys = ["schemas", "defaults", "roles", "memberships", "extensions", "extensionMembers", "databaseOwner", "sequences"];
export const scopedKeys = ["relations", "columns", "constraints", "indexes", "triggers", "policies"];
export function projection(catalog: Record<string, unknown>) {
  const rows = (key: string) => catalog[key] as Record<string, unknown>[];
  return Object.fromEntries([
    ...globalKeys.map(k => [k, catalog[k]]),
    ...scopedKeys.map(k => [k, rows(k).filter(f => f.schema === "public" && tables.includes(String(f.table ?? f.name)))]),
    ["types", rows("types").filter(f => f.schema === "public" && (tables.includes(String(f.name)) || tables.some(t => "_" + t === f.name) || (f.kind !== "c" && !String(f.name).startsWith("_"))))],
  ]);
}
export function vector(receipt: Record<string, unknown>) {
  return { catalog: projection(receipt.catalog as Record<string, unknown>), helpers: (receipt.functions as Record<string, unknown>[]).filter(f => !(f.schema === "public" && names.includes(String(f.name)))), auth: receipt.auth, native: receipt.native, indexes: receipt.indexes, shapes: receipt.shapes };
}
const tableArray = "array[" + tables.map(n => "'" + n + "'").join(",") + "]";
export const projectionSql = `pg_catalog.jsonb_build_object(${[
  ...globalKeys.map(k => "'" + k + "',v_catalog->'" + k + "'"),
  ...scopedKeys.map(k => "'" + k + "',(select coalesce(pg_catalog.jsonb_agg(f.value order by f.ordinality),'[]'::jsonb) from pg_catalog.jsonb_array_elements(v_catalog->'" + k + "') with ordinality f(value,ordinality) where f.value->>'schema'='public' and coalesce(f.value->>'table',f.value->>'name')=any(" + tableArray + "))"),
  "'types',(select coalesce(pg_catalog.jsonb_agg(f.value order by f.ordinality),'[]'::jsonb) from pg_catalog.jsonb_array_elements(v_catalog->'types') with ordinality f(value,ordinality) where f.value->>'schema'='public' and ((f.value->>'name')=any(" + tableArray + ") or substring(f.value->>'name' from 2)=any(" + tableArray + ") and left(f.value->>'name',1)='_' or f.value->>'kind'<>'c' and left(f.value->>'name',1)<>'_'))",
].join(",")})`;
export const vectorSql = `select catalog into v_catalog from (${catalogQuery}) captured;
 v_before:=${projectionSql};
 select pg_catalog.jsonb_build_object('catalog',v_before,
 'helpers',(select coalesce(pg_catalog.jsonb_agg(to_jsonb(f) order by f.schema,f.name,f.args),'[]'::jsonb) from (${functionsQuery})f where not(f.schema='public' and f.name='update_group_enquiry_with_audit')),
 'auth',(select value from (${authQuery})q),
 'native',(select value from (${nativeQuery})q),
 'indexes',(select value from (${indexDetailsQuery})q),
 'shapes',(select value from (${shapesQuery})q)) into v_vector;`;
