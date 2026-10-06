/** Ruling30: reproducible LF-only Task9 schema source; no data or helper replacement. */
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { catalogQuery, hash } from "../../../../supabase/rls-tests/helpers/productionSchemaClone";
import {
  tables,
  functionsQuery,
  authQuery,
  nativeQuery,
  indexDetailsQuery,
} from "./task-9-profile";
const file = "20261002045253_r01_adoption_atomic_forward.sql";
const captures = ["task-9-capture-hosted-1790919336913", "task-9-capture-modern-1790919424679"];
const profiles = await Promise.all(
  captures.map(async (p) =>
    JSON.parse(
      await readFile(
        ".superpowers/sdd/r01-forward-schema-plan-20261001/" + p + "/receipt.json",
        "utf8",
      ),
    ),
  ),
);
const md5 = (s: string) => createHash("md5").update(s).digest("hex");
const literal = (s: unknown) => (s === null ? "null" : "'" + String(s).replaceAll("'", "''") + "'");
const json = (s: unknown) => literal(JSON.stringify(s)) + "::jsonb";
const unique = (items: unknown[]) => [...new Map(items.map((p) => [hash(p), p])).values()];
const body = async (file: string, name: string) => {
  const s = (await readFile("supabase/migrations/" + file, "utf8")).replaceAll("\r\n", "\n");
  const m = s.match(
    new RegExp(
      "create or replace function public\\." +
        name +
        "\\([\\s\\S]*?as (\\$\\$|\\$function\\$)([\\s\\S]*?)\\1;",
      "i",
    ),
  );
  if (!m) throw Error("Exact legacy body absent " + name);
  return m[2];
};
const coordinator = await body(
    "20260925104926_atomic_adoption_coordinator_audit.sql",
    "mutate_adoption_coordinator_with_audit",
  ),
  search = await body(
    "20260926110000_manual_case_identity_search.sql",
    "search_manual_case_identity",
  ),
  manual = await body(
    "20260926133000_expose_manual_adoption_case_rpc.sql",
    "create_manual_adoption_case",
  );
const authFence = `  perform 1 from auth.users u\n  where u.id = p_actor_user_id and u.email_confirmed_at is not null\n    and (u.banned_until is null or u.banned_until <= pg_catalog.clock_timestamp())\n  for share;\n  if not found then\n    raise exception 'Active staff or admin actor required' using errcode = '42501';\n  end if;\n`;
const oldActor = `  select * into actor\n  from public.admin_user\n  where auth_user_id = p_actor_user_id\n    and status = 'active'\n    and role in ('staff', 'admin');`;
if (!coordinator.includes(oldActor)) throw Error("Exact coordinator actor predicate differs");
const nextCoordinator = coordinator.replace(
  oldActor,
  authFence +
    oldActor.replace(
      "and role in ('staff', 'admin');",
      "and role in ('staff', 'admin')\n  for share;",
    ),
);
const nextManual = `\nbegin\n${authFence}  perform 1 from public.admin_user a\n  where a.auth_user_id = p_actor_user_id and a.status = 'active'\n    and a.role in ('staff', 'admin')\n  for share;\n  if not found then\n    raise exception 'Active staff or admin actor required' using errcode = '42501';\n  end if;\n  return private.create_manual_adoption_case(\n    p_actor_user_id, p_identity, p_case, p_initial_task\n  );\nend;\n`;
const specs = [
  {
    name: "mutate_adoption_coordinator_with_audit",
    args: "p_actor_user_id uuid, p_entity text, p_operation text, p_id uuid, p_payload jsonb",
    sig: "uuid,text,text,uuid,jsonb",
    defaults: 0,
    defaultExpression: null,
    definer: true,
    volatility: "v",
    oldLanguage: "plpgsql",
    language: "plpgsql",
    old: coordinator,
    next: nextCoordinator,
  },
  {
    name: "search_manual_case_identity",
    args: "p_query text, p_page integer default 1, p_page_size integer default 10",
    sig: "text,integer,integer",
    defaults: 2,
    defaultExpression: "1, 10",
    definer: false,
    volatility: "s",
    oldLanguage: "sql",
    language: "sql",
    old: search,
    next: search,
  },
  {
    name: "create_manual_adoption_case",
    args: "p_actor_user_id uuid, p_identity jsonb, p_case jsonb, p_initial_task jsonb default null",
    sig: "uuid,jsonb,jsonb,jsonb",
    defaults: 1,
    defaultExpression: "NULL::jsonb",
    definer: true,
    volatility: "v",
    oldLanguage: "sql",
    language: "plpgsql",
    old: manual,
    next: nextManual,
  },
];
for (const s of specs) {
  const p = profiles[1].functions.find(
    (p: Record<string, unknown>) => p.schema === "public" && p.name === s.name,
  );
  if (
    !p ||
    p.body !== md5(s.old) ||
    p.defaults !== s.defaults ||
    p.default_expression !== s.defaultExpression
  )
    throw Error("Captured legacy target differs " + s.name);
}
let sql = `-- R01 Task9: three exact adoption entrypoints; Rulings28-31.\n-- Existing private manual helper/default/ACL and modern version triggers are preserved.\n-- Task1 and pending Task8 are excluded; no data/backfill/identity merge or approval.\nset local search_path = '';\ndo $migration$\ndeclare v_catalog jsonb; v_actual jsonb; v_name text; v_table oid; v_function oid;\nbegin\n  if current_user <> 'postgres' then raise exception 'R01 adoption owner context differs' using errcode='55000'; end if;\n  if pg_catalog.has_any_column_privilege('service_role','auth.users','SELECT,UPDATE')\n    or not pg_catalog.has_table_privilege('postgres','auth.users','SELECT')\n    or not pg_catalog.has_table_privilege('postgres','auth.users','UPDATE') then\n    raise exception 'R01 adoption managed Auth privileges differ' using errcode='55000'; end if;\n  select catalog into v_catalog from (${catalogQuery}) captured;\n`;
for (const name of tables) {
  const allowed = unique(
    profiles.map((p) => p.profiles.find((x: { name: string }) => x.name === name).md5),
  );
  sql += `  v_name:='${name}'; v_table:=pg_catalog.to_regclass('public.'||v_name);\n  if v_table is null then raise exception 'R01 adoption table absent: ${name}' using errcode='55000'; end if;\n  select pg_catalog.jsonb_object_agg(k,(select coalesce(pg_catalog.jsonb_agg(e.value order by e.ordinality),'[]'::jsonb) from pg_catalog.jsonb_array_elements(v_catalog->k) with ordinality e(value,ordinality) where e.value->>'schema'='public' and coalesce(e.value->>'table',e.value->>'name')=v_name))\n    || pg_catalog.jsonb_build_object('shape',(select pg_catalog.jsonb_build_object('persistence',c.relpersistence,'rules',c.relhasrules,'rewrites',(select count(*) from pg_catalog.pg_rewrite r where r.ev_class=c.oid)) from pg_catalog.pg_class c where c.oid=v_table)) into v_actual from unnest(array['relations','columns','constraints','indexes','triggers','policies']) k;\n  if pg_catalog.md5(v_actual::text) not in(${allowed.map(literal).join(",")}) then raise exception 'R01 adoption table metadata differs: ${name}' using errcode='55000'; end if;\n`;
}
for (const [name, query, values] of [
  ["managed Auth", authQuery, profiles.map((p) => p.auth)],
  ["native FK", nativeQuery, profiles.map((p) => p.native)],
  ["index flags", indexDetailsQuery, profiles.map((p) => p.indexes)],
] as const)
  sql += `  select value into v_actual from (${query}) captured;\n  if v_actual not in(${unique(values).map(json).join(",")}) then raise exception 'R01 adoption ${name} metadata differs' using errcode='55000'; end if;\n`;
for (const [k, label] of [
  ["schemas", "schema ACL"],
  ["defaults", "creator global/schema default ACL"],
] as const)
  sql += `  if v_catalog->'${k}' not in(${unique(profiles.map((p) => p.catalog[k]))
    .map(json)
    .join(
      ",",
    )}) then raise exception 'R01 adoption ${label} differs' using errcode='55000'; end if;\n`;
const helpers = unique(
  profiles.flatMap((p) =>
    p.functions.filter(
      (f: { schema: string; name: string }) =>
        f.schema !== "public" || !specs.some((s) => s.name === f.name),
    ),
  ),
);
const helperNames = [
  ...new Set((helpers as Record<string, unknown>[]).map((f) => f.schema + "." + f.name)),
];
for (const name of helperNames) {
  const variants = (helpers as Record<string, unknown>[]).filter(
      (f) => f.schema + "." + f.name === name,
    ),
    required = profiles.every((p) =>
      p.functions.some((f: Record<string, unknown>) => f.schema + "." + f.name === name),
    );
  sql += `  select coalesce(pg_catalog.jsonb_agg(to_jsonb(f) order by f.schema,f.name,f.args),'[]'::jsonb) into v_actual from (${functionsQuery}) f where f.schema||'.'||f.name='${name}';\n  if ${required ? "v_actual='[]'::jsonb or " : ""}(v_actual<>'[]'::jsonb and v_actual not in(${variants.map((v) => json([v])).join(",")})) then raise exception 'R01 adoption helper contract differs: ${name}' using errcode='55000'; end if;\n`;
}
for (const s of specs) {
  const oldProfile = profiles[1].functions.find(
    (p: Record<string, unknown>) => p.schema === "public" && p.name === s.name,
  );
  const allargs = oldProfile.allargs;
  sql += `  v_function:=pg_catalog.to_regprocedure('public.${s.name}(${s.sig})');\n  if (select count(*) from pg_catalog.pg_proc where pronamespace='public'::regnamespace and proname='${s.name}')<>(case when v_function is null then 0 else 1 end) then raise exception 'R01 adoption overload differs: ${s.name}' using errcode='55000'; end if;\n  if v_function is not null and (not exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid=p.prolang where p.oid=v_function and p.prokind='f' and p.proowner='postgres'::regrole and p.prosecdef=${s.definer} and p.pronargdefaults=${s.defaults} and pg_catalog.pg_get_expr(p.proargdefaults,0) is not distinct from ${literal(s.defaultExpression)} and pg_catalog.pg_get_function_arguments(p.oid)=${literal(allargs)} and pg_catalog.pg_get_function_result(p.oid)='jsonb' and p.provolatile='${s.volatility}' and p.proparallel='u' and not p.proisstrict and not p.proleakproof and p.procost=100 and p.prorows=0 and p.prosupport=0 and p.provariadic=0 and p.proargmodes is null and ((l.lanname='${s.oldLanguage}' and pg_catalog.md5(p.prosrc)='${md5(s.old)}' and p.proconfig=array['search_path=public, pg_temp']::text[]) or (l.lanname='${s.language}' and pg_catalog.md5(p.prosrc)='${md5(s.next)}' and p.proconfig=array['search_path=""']::text[])))\n    or (select count(*) from pg_catalog.pg_proc p,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where p.oid=v_function)<>2\n    or exists(select 1 from pg_catalog.pg_proc p,lateral pg_catalog.aclexplode(coalesce(p.proacl,pg_catalog.acldefault('f',p.proowner))) a where p.oid=v_function and (a.grantor<>p.proowner or a.grantee not in(p.proowner,'service_role'::regrole) or a.privilege_type<>'EXECUTE' or a.is_grantable))\n    or not pg_catalog.has_function_privilege('service_role',v_function,'EXECUTE') or pg_catalog.has_function_privilege('anon',v_function,'EXECUTE') or pg_catalog.has_function_privilege('authenticated',v_function,'EXECUTE')) then raise exception 'R01 adoption target contract differs: ${s.name}' using errcode='55000'; end if;\n`;
}
sql += "  -- All guards above finish before the first function definition or grant.\n";
for (const s of specs)
  sql += `  v_function:=pg_catalog.to_regprocedure('public.${s.name}(${s.sig})');\n  if v_function is null or not exists(select 1 from pg_catalog.pg_proc p join pg_catalog.pg_language l on l.oid=p.prolang where p.oid=v_function and pg_catalog.md5(p.prosrc)='${md5(s.next)}' and p.proconfig=array['search_path=""']::text[] and l.lanname='${s.language}') then\n    execute $definition$create or replace function public.${s.name}(${s.args})\nreturns jsonb\nlanguage ${s.language}\n${s.volatility === "s" ? "stable\n" : ""}${s.definer ? "security definer\n" : ""}set search_path = ''\nas $function$${s.next}$function$;$definition$;\n    if v_function is null then\n      revoke all on function public.${s.name}(${s.sig}) from public,anon,authenticated,service_role;\n      grant execute on function public.${s.name}(${s.sig}) to service_role;\n    end if;\n  end if;\n`;
sql += "end;\n$migration$;\n";
if (sql.includes("\r")) throw Error("LF-only source required");
await writeFile("supabase/migrations/" + file, sql);
await writeFile(
  "docs/evidence/audit-remediation-20260927/r01-forward/task-9-generated-profiles.json",
  JSON.stringify(
    {
      file,
      sha256: hash(sql),
      captures,
      specs: specs.map(({ old, next, ...s }) => ({
        ...s,
        oldBodyMd5: md5(old),
        newBodyMd5: md5(next),
      })),
      helpers,
      tableProfiles: profiles.map((p) => ({
        mode: p.mode,
        profiles: p.profiles.map((x: { name: string; md5: string }) => ({
          name: x.name,
          md5: x.md5,
        })),
      })),
      defaults: profiles.map((p) => p.catalog.defaults),
    },
    null,
    2,
  ) + "\n",
);
console.log(JSON.stringify({ file, bytes: Buffer.byteLength(sql), sha256: hash(sql) }));
