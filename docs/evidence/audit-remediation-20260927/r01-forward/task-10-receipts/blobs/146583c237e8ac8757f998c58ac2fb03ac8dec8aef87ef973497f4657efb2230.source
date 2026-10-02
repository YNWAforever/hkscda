import { assertReceipt } from "./task-10-receipt";
/** Ruling36: only actual Task10 known profiles and demonstrated actor fences. */
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { catalogQuery, hash } from "../../../../supabase/rls-tests/helpers/productionSchemaClone";
import {
  tables,
  names,
  functionsQuery,
  authQuery,
  nativeQuery,
  indexDetailsQuery,
  triggerDetailsQuery,
} from "./task-10-profile";
const file = "20261002111418_r01_admin_access_atomic_forward.sql";
const profileInputs = JSON.parse(
  await readFile(
    process.env.R01_TASK10_PROFILE_INPUTS ??
      "docs/evidence/audit-remediation-20260927/r01-forward/task-10-profile-inputs.json",
    "utf8",
  ),
);
for (const key of ["captures", "globals"]) {
  if (
    !Array.isArray(profileInputs[key]) ||
    profileInputs[key].length !== 2 ||
    profileInputs[key].some((p: unknown) => typeof p !== "string" || !p)
  )
    throw Error("Task10 ineligible profile input cardinality:" + key);
}
const captures: string[] = profileInputs.captures;
const profiles = await Promise.all(
  captures.map(async (p) => JSON.parse(await readFile(p, "utf8"))),
);
for (const [i, p] of profiles.entries()) assertReceipt(p, "capture", i === 0 ? "hosted" : "modern");
const globalReceipts = await Promise.all(
  (profileInputs.globals as string[]).map(async (p) => JSON.parse(await readFile(p, "utf8"))),
);
for (const [i, p] of globalReceipts.entries())
  assertReceipt(p, "global", i === 0 ? "hosted" : "modern");
const globalFinal = { hosted: globalReceipts[0].after, modern: globalReceipts[1].after };
const globalBefore = globalReceipts[0].before;
const globalProfiles = [globalBefore, globalFinal.hosted, globalFinal.modern];
const componentProof = JSON.parse(await readFile(profileInputs.component, "utf8"));
assertReceipt(componentProof, "auth-component", "component");
if (process.argv.includes("--validate-profiles-only")) {
  console.log("Task10 actual generator strict profile predicates PASS");
  process.exit(0);
}
const md5 = (s: string) => createHash("md5").update(s).digest("hex");
const literal = (s: unknown) => (s === null ? "null" : "'" + String(s).replaceAll("'", "''") + "'");
const json = (s: unknown) => literal(JSON.stringify(s)) + "::jsonb";
const unique = (items: unknown[]) => [...new Map(items.map((x) => [hash(x), x])).values()];
const sigs = [
  "uuid,uuid,text,text",
  "uuid,uuid,text,text,timestamptz",
  "uuid,uuid,timestamptz",
  "uuid",
];
const declarations = [
  "p_actor_user_id uuid,p_target_id uuid,p_role text default null,p_status text default null",
  "p_actor_user_id uuid,p_auth_user_id uuid,p_email text,p_role text,p_sent_at timestamptz",
  "p_actor_user_id uuid,p_target_id uuid,p_sent_at timestamptz",
  "p_auth_user_id uuid",
];
const specs = await Promise.all(
  names.map(async (name, i) => {
    const legacy =
      name === "activate_admin_invite_with_audit"
        ? "20260925133500_atomic_admin_invite_activation.sql"
        : "20260925110000_admin_user_access_atomicity.sql";
    const source = (await readFile("supabase/migrations/" + legacy, "utf8")).replaceAll(
      "\r\n",
      "\n",
    );
    const m = source.match(
      new RegExp(
        "create or replace function public\\." + name + "\\([\\s\\S]*?as \\$\\$([\\s\\S]*?)\\$\\$;",
        "i",
      ),
    );
    if (!m) throw Error("Exact legacy body absent " + name);
    const old = m[1],
      p = profiles[1].functions.find(
        (f: Record<string, unknown>) => f.schema === "public" && f.name === name,
      );
    if (p.body !== md5(old)) throw Error("Own captured body differs " + name);
    const id = i === 3 ? "p_auth_user_id" : "p_actor_user_id",
      error = i === 3 ? "admin_user_not_found" : "admin_actor_denied";
    const lock =
      "  perform pg_advisory_xact_lock(hashtextextended('public.admin_user.active_admin', 0));";
    if (!old.includes(lock)) throw Error("Actual advisory absent");
    let next = old.replace(
      lock,
      lock +
        `\n\n  perform 1 from auth.users u\n  where u.id = ${id} and u.email_confirmed_at is not null\n    and (u.banned_until is null or u.banned_until <= pg_catalog.clock_timestamp())\n  for share;\n  if not found then\n    raise exception '${error}' using errcode = 'P0001';\n  end if;`,
    );
    if (i !== 3) {
      const predicate =
        "  if not exists (\n    select 1 from public.admin_user\n    where auth_user_id = p_actor_user_id and role = 'admin' and status = 'active'\n  ) then";
      if (!next.includes(predicate)) throw Error("Exact admin actor differs");
      next = next.replace(
        predicate,
        "  perform 1 from public.admin_user\n  where auth_user_id = p_actor_user_id and role = 'admin' and status = 'active'\n  for share;\n  if not found then",
      );
    }
    next = next.replace(
      "email = p_email::citext",
      "email OPERATOR(public.=) p_email::public.citext",
    );
    for (const fn of [
      "pg_advisory_xact_lock",
      "hashtextextended",
      "btrim",
      "jsonb_build_object",
      "now",
    ])
      next = next.replaceAll(
        new RegExp("(?<![.a-z_])" + fn + "\\(", "g"),
        "pg_catalog." + fn + "(",
      );
    const { definition: _definition, ...known } = p;
    return {
      name,
      sig: sigs[i],
      args: declarations[i],
      old,
      next,
      known,
      nextKnown: { ...known, body: md5(next), config: ['search_path=""'] },
    };
  }),
);
let sql = `-- R01 Task10; actual missing/legacy RED, Ruling36. No data/backfill/provider action.\nset local search_path = '';\ndo $migration$\ndeclare v_catalog jsonb;v_actual jsonb;v_name text;v_table oid;v_function oid;\nbegin\n if current_user<>'postgres' then raise exception 'R01 admin owner context differs' using errcode='55000';end if;\n if pg_catalog.has_any_column_privilege('service_role','auth.users','SELECT,UPDATE') or not pg_catalog.has_table_privilege('postgres','auth.users','SELECT') or not pg_catalog.has_table_privilege('postgres','auth.users','UPDATE') then raise exception 'R01 admin effective Auth privileges differ' using errcode='55000';end if;\n select catalog into v_catalog from (${catalogQuery}) captured;\n`;
// Captured browser/service outgoing membership NULL forbids any first inherited or SET edge.
for (const k of ["roles", "memberships"])
  sql += ` if v_catalog->'${k}' not in(${unique(profiles.map((p) => p.catalog[k]))
    .map(json)
    .join(",")}) then raise exception 'R01 admin ${k} differs' using errcode='55000';end if;\n`;
const effectiveRoleGuard = ` if exists(select 1 from pg_catalog.pg_roles b cross join pg_catalog.pg_roles s where b.rolname in('anon','authenticated') and s.rolname in('service_role','postgres','supabase_admin') and (pg_catalog.pg_has_role(b.oid,s.oid,'USAGE') or pg_catalog.pg_has_role(b.oid,s.oid,'SET'))) then raise exception 'R01 admin browser server-role access differs' using errcode='55000';end if;\n`;
sql += effectiveRoleGuard;
for (const name of tables) {
  const allowed = unique(
    globalProfiles.map((p) => p.profiles.find((x: { name: string }) => x.name === name).md5),
  );
  sql += ` v_name:='${name}';v_table:=pg_catalog.to_regclass('public.'||v_name);\n if v_table is null then raise exception 'R01 admin table absent:${name}' using errcode='55000';end if;\n select pg_catalog.jsonb_object_agg(k,(select coalesce(pg_catalog.jsonb_agg(e.value order by e.ordinality),'[]'::jsonb) from pg_catalog.jsonb_array_elements(v_catalog->k) with ordinality e(value,ordinality) where e.value->>'schema'='public' and coalesce(e.value->>'table',e.value->>'name')=v_name))||pg_catalog.jsonb_build_object('shape',(select pg_catalog.jsonb_build_object('persistence',c.relpersistence,'rules',c.relhasrules,'rewrites',(select count(*) from pg_catalog.pg_rewrite r where r.ev_class=c.oid)) from pg_catalog.pg_class c where c.oid=v_table)) into v_actual from unnest(array['relations','columns','constraints','indexes','triggers','policies']) k;\n if pg_catalog.md5(v_actual::text) not in(${allowed.map(literal).join(",")}) then raise exception 'R01 admin table metadata differs:${name}' using errcode='55000';end if;\n`;
}
for (const [label, query, values] of [
  ["managed Auth", authQuery, profiles.map((p) => p.auth)],
  ["native FK", nativeQuery, profiles.map((p) => p.native)],
  ["index flags", indexDetailsQuery, profiles.map((p) => p.indexes)],
  ["native application triggers", triggerDetailsQuery, globalProfiles.map((p) => p.triggers)],
] as const)
  sql += ` select value into v_actual from (${query}) captured;\n if v_actual not in(${unique(values).map(json).join(",")}) then raise exception 'R01 admin ${label} metadata differs' using errcode='55000';end if;\n`;
for (const k of ["schemas", "defaults"])
  sql += ` if v_catalog->'${k}' not in(${unique(profiles.map((p) => p.catalog[k]))
    .map(json)
    .join(",")}) then raise exception 'R01 admin ${k} differs' using errcode='55000';end if;\n`;
const helpers = unique(
  [
    ...profiles,
    globalFinal.hosted,
    globalFinal.modern,
    { functions: [componentProof.afterHelper] },
  ].flatMap((p) =>
    p.functions.filter(
      (f: Record<string, unknown>) => !(f.schema === "public" && names.includes(String(f.name))),
    ),
  ),
) as Record<string, unknown>[];
for (const name of [...new Set(helpers.map((f) => f.schema + "." + f.name))]) {
  const variants = helpers.filter((f) => f.schema + "." + f.name === name),
    required = profiles.every((p) =>
      p.functions.some((f: Record<string, unknown>) => f.schema + "." + f.name === name),
    );
  sql += ` select coalesce(pg_catalog.jsonb_agg(to_jsonb(f) order by f.schema,f.name,f.args),'[]'::jsonb) into v_actual from (${functionsQuery}) f where f.schema||'.'||f.name='${name}';\n if ${required ? "v_actual='[]'::jsonb or " : ""}(v_actual<>'[]'::jsonb and v_actual not in(${variants.map((v) => json([v])).join(",")})) then raise exception 'R01 admin helper differs:${name}' using errcode='55000';end if;\n`;
}
// Bind the joint table/helper/native profile; unknown partial combinations fail closed.
sql += ` select pg_catalog.jsonb_build_object('triggers',(select value from (${triggerDetailsQuery}) t),'guards',(select coalesce(jsonb_agg(to_jsonb(f)order by f.schema,f.name,f.args),'[]'::jsonb)from (${functionsQuery})f where f.schema='private' and f.name in('lock_admin_user_mutation','require_active_admin_user'))) into v_actual;\n if v_actual not in(${unique(
  globalProfiles.map((p) => ({
    triggers: p.triggers,
    guards: p.functions.filter(
      (f: Record<string, unknown>) =>
        f.schema === "private" &&
        ["lock_admin_user_mutation", "require_active_admin_user"].includes(String(f.name)),
    ),
  })),
)
  .map(json)
  .join(
    ",",
  )}) then raise exception 'R01 admin joint native/helper profile differs' using errcode='55000';end if;\n`;
for (const s of specs)
  sql += ` v_function:=pg_catalog.to_regprocedure('public.${s.name}(${s.sig})');\n if (select count(*) from pg_catalog.pg_proc where pronamespace='public'::regnamespace and proname='${s.name}')<>(case when v_function is null then 0 else 1 end) then raise exception 'R01 admin target overload differs:${s.name}' using errcode='55000';end if;\n if v_function is not null then\n select to_jsonb(f)-'definition' into v_actual from (${functionsQuery}) f where f.schema='public' and f.name='${s.name}';\n if v_actual not in(${json(s.known)},${json(s.nextKnown)}) then raise exception 'R01 admin target differs:${s.name}' using errcode='55000';end if;\n if pg_catalog.has_function_privilege('anon',v_function,'EXECUTE') or pg_catalog.has_function_privilege('authenticated',v_function,'EXECUTE') or not pg_catalog.has_function_privilege('service_role',v_function,'EXECUTE') then raise exception 'R01 admin effective target access differs:${s.name}' using errcode='55000';end if;end if;\n`;
sql += " -- All guards finish before first creation/replacement/grant.\n";
const prefixSource = (
  await readFile("supabase/migrations/20260925110000_admin_user_access_atomicity.sql", "utf8")
).replaceAll("\r\n", "\n");
for (const name of ["lock_admin_user_mutation", "require_active_admin_user"]) {
  const match = prefixSource.match(
    new RegExp("create or replace function private\\." + name + "\\([\\s\\S]*?\\$\\$;", "i"),
  );
  if (!match) throw Error("Exact approved private source absent");
  sql += ` if pg_catalog.to_regprocedure('private.${name}()') is null then execute $private_definition$${match[0]}$private_definition$;end if;\n`;
  const trigger = prefixSource.match(new RegExp("create trigger " + name + "[\\s\\S]*?;", "i"));
  if (!trigger) throw Error("Exact approved trigger source absent");
  sql += ` if not exists(select 1 from pg_catalog.pg_trigger where tgrelid='public.admin_user'::regclass and tgname='${name}')then execute $native_definition$${trigger[0]}$native_definition$;end if;\n`;
}
sql += ` if exists(select 1 from pg_catalog.pg_policy where polrelid='public.admin_user'::regclass and polname='admins can manage admin users')then drop policy "admins can manage admin users" on public.admin_user;create policy "admins can view admin users" on public.admin_user for select to authenticated using(private.has_admin_role(array['admin']));end if;\n revoke insert,update,delete,truncate on public.admin_user from anon,authenticated;\n`;
for (const s of specs)
  sql += ` v_function:=pg_catalog.to_regprocedure('public.${s.name}(${s.sig})');\n if v_function is null or not exists(select 1 from pg_catalog.pg_proc p where p.oid=v_function and pg_catalog.md5(p.prosrc)='${md5(s.next)}' and p.proconfig=array['search_path=""']::text[]) then\n execute $definition$create or replace function public.${s.name}(${s.args})\nreturns public.admin_user\nlanguage plpgsql\nsecurity definer\nset search_path = ''\nas $function$${s.next}$function$;$definition$;\n if v_function is null then revoke all on function public.${s.name}(${s.sig}) from public,anon,authenticated,service_role;grant execute on function public.${s.name}(${s.sig}) to service_role;end if;end if;\n`;
// Bind the final role context and effective rights after all four targets exist.
sql += ` select catalog into v_catalog from (${catalogQuery}) captured;\n`;
for (const k of ["roles", "memberships"])
  sql += ` if v_catalog->'${k}' not in(${unique(profiles.map((p) => p.catalog[k]))
    .map(json)
    .join(
      ",",
    )}) then raise exception 'R01 admin final ${k} differs' using errcode='55000';end if;\n`;
sql += effectiveRoleGuard;
for (const s of specs)
  sql += ` v_function:=pg_catalog.to_regprocedure('public.${s.name}(${s.sig})');\n if v_function is null or pg_catalog.has_function_privilege('anon',v_function,'EXECUTE') or pg_catalog.has_function_privilege('authenticated',v_function,'EXECUTE') or not pg_catalog.has_function_privilege('service_role',v_function,'EXECUTE') then raise exception 'R01 admin final effective target access differs:${s.name}' using errcode='55000';end if;\n`;
sql += "end;\n$migration$;\n";
if (sql.includes("\r")) throw Error("LF required");
await writeFile("supabase/migrations/" + file, sql);
await writeFile(
  "docs/evidence/audit-remediation-20260927/r01-forward/task-10-generated-profiles.json",
  JSON.stringify(
    {
      file,
      sha256: hash(sql),
      captures,
      helpers,
      specs: specs.map(({ old, next, ...s }) => ({
        ...s,
        oldBodyMd5: md5(old),
        newBodyMd5: md5(next),
      })),
    },
    null,
    2,
  ) + "\n",
);
console.log(JSON.stringify({ file, sha256: hash(sql), bytes: Buffer.byteLength(sql) }));
