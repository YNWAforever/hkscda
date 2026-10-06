/** Reproducible Task8 forward SQL from measured profiles and exact legacy bodies. */
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { catalogQuery } from "../../../../supabase/rls-tests/helpers/productionSchemaClone";
import {
  tables,
  functionsQuery,
  targetQuery,
  authQuery,
  nativeQuery,
  indexDetailsQuery,
  shapeQuery,
} from "./task-8-profile";
const [hostedPath, modernPath, file] = process.argv.slice(2);
if (
  !hostedPath ||
  !modernPath ||
  !/^supabase\/migrations\/\d{14}_r01_volunteer_atomic_forward.sql$/.test(file)
)
  throw Error("Measured profiles and CLI-generated filename required");
const profiles = await Promise.all(
  [hostedPath, modernPath].map(async (p) => JSON.parse(await readFile(p, "utf8"))),
);
const legacy = (
  await readFile(
    "supabase/migrations/20260925104051_volunteer_public_registration_idempotency.sql",
    "utf8",
  )
).replaceAll("\r\n", "\n");
const md5 = (s: string) => createHash("md5").update(s).digest("hex");
const literal = (s: string) => "'" + s.replaceAll("'", "''") + "'";
const json = (v: unknown) => literal(JSON.stringify(v)) + "::jsonb";
const unique = (values: unknown[]) => [
  ...new Map(values.map((v) => [JSON.stringify(v), v])).values(),
];
const names = ["create_volunteer_registration_idempotent", "clone_volunteer_activity_with_audit"];
const specs = names.map((name) => {
  const match = legacy.match(
    new RegExp(
      "create or replace function public\\." +
        name +
        "\\(([\\s\\S]*?)\\) returns (\\w+)[\\s\\S]*?as \\$\\$([\\s\\S]*?)\\$\\$;",
      "i",
    ),
  );
  if (!match) throw Error("Exact legacy target absent");
  const old = profiles[1].targets.find((t: { name: string }) => t.name === name);
  if (!old || old.body !== md5(match[3]))
    throw Error("Captured modern target body differs " + name);
  let body = match[3];
  if (name === "clone_volunteer_activity_with_audit") {
    const actor =
      "  if not exists (\n    select 1 from public.admin_user\n     where auth_user_id = p_actor_user_id\n       and status = 'active'\n       and role in ('staff', 'admin')\n  ) then";
    if (!body.includes(actor)) throw Error("Exact clone actor predicate absent");
    body = body.replace(
      actor,
      `  -- Match modern statement-trigger lock order before locking actor rows.\n  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('volunteer-domain', 0));\n  perform 1 from auth.users u\n   where u.id = p_actor_user_id and u.email_confirmed_at is not null\n     and (u.banned_until is null or u.banned_until <= pg_catalog.clock_timestamp())\n   for share;\n  if not found then\n    raise exception 'volunteer_forbidden' using errcode = '42501';\n  end if;\n  perform 1 from public.admin_user a\n   where a.auth_user_id = p_actor_user_id and a.status = 'active'\n     and a.role in ('staff', 'admin')\n   for share;\n  if not found then`,
    );
  }
  for (const n of [
    "pg_advisory_xact_lock",
    "hashtextextended",
    "clock_timestamp",
    "jsonb_build_object",
    "to_jsonb",
  ])
    body = body.replace(new RegExp("(?<![\\w.])" + n + "\\(", "g"), "pg_catalog." + n + "(");
  const next = { ...old, config: ['search_path=""'], body: md5(body) };
  delete next.definition;
  return { name, args: match[1], result: match[2], old, next, body };
});
let sql = `-- R01 Task8: only idempotent registration and atomic audited clone.\n-- No table/grant/backfill/provider/activation changes. Known good modern\n-- registration entrypoint is retained byte-for-byte. Unknown profiles refuse.\nset local search_path = '';\ndo $migration$\ndeclare v_catalog jsonb; v_actual jsonb; v_name text; v_target jsonb;\nbegin\n  if current_user <> 'postgres' then raise exception 'R01 volunteer owner context differs' using errcode='55000'; end if;\n  select catalog into v_catalog from (${catalogQuery}) captured;\n`;
for (const name of tables) {
  const values = profiles.map((p) =>
    Object.fromEntries(
      ["relations", "columns", "constraints", "indexes", "triggers", "policies"].map((k) => [
        k,
        (p.catalog[k] ?? []).filter(
          (e: { schema: string; table?: string; name?: string }) =>
            e.schema === "public" && (e.table ?? e.name) === name,
        ),
      ]),
    ),
  );
  sql += `  v_name:=${literal(name)};\n  select pg_catalog.jsonb_object_agg(k,(select coalesce(pg_catalog.jsonb_agg(e.value order by e.ordinality),'[]'::jsonb) from pg_catalog.jsonb_array_elements(v_catalog->k) with ordinality e(value,ordinality) where e.value->>'schema'='public' and coalesce(e.value->>'table',e.value->>'name')=v_name)) into v_actual from unnest(array['relations','columns','constraints','indexes','triggers','policies']) k;\n  if v_actual not in (${unique(values).map(json).join(",")}) then raise exception 'R01 volunteer table profile differs: ${name}' using errcode='55000'; end if;\n`;
}
for (const [name, query, key] of [
  ["helper", functionsQuery, "functions"],
  ["managed Auth", authQuery, "auth"],
  ["native FK", nativeQuery, "native"],
  ["index flags", indexDetailsQuery, "indexes"],
  ["relation shape", shapeQuery, "shape"],
])
  sql += `  select value into v_actual from (${query}) captured;\n  if v_actual not in (${unique(
    profiles.map((p) => p[key]),
  )
    .map(json)
    .join(
      ",",
    )}) then raise exception 'R01 volunteer ${name} profile differs' using errcode='55000'; end if;\n`;
for (const key of ["schemas", "defaults", "roles", "memberships"])
  sql += `  if v_catalog->'${key}' not in (${unique(profiles.map((p) => p.catalog[key]))
    .map(json)
    .join(
      ",",
    )}) then raise exception 'R01 volunteer ${key} differs' using errcode='55000'; end if;\n`;
sql += `  select value into v_target from (${targetQuery}) captured;\n  if pg_catalog.jsonb_array_length(v_target)>2 then raise exception 'R01 volunteer unexpected overload' using errcode='55000'; end if;\n`;
for (const s of specs) {
  sql += `  select e into v_actual from pg_catalog.jsonb_array_elements(v_target) e where e->>'name'=${literal(s.name)};\n  if v_actual is not null and v_actual<>${json(s.old)} and (v_actual-'definition')<>${json(s.next)} then raise exception 'R01 volunteer target differs: ${s.name}' using errcode='55000'; end if;\n`;
}
for (const s of specs) {
  sql += `  select e into v_actual from pg_catalog.jsonb_array_elements(v_target) e where e->>'name'=${literal(s.name)};\n`;
  // Existing modern registration body, config and ACL are already reviewed; preserve them.
  sql +=
    s.name === names[0]
      ? "  if v_actual is null then\n"
      : "  if v_actual is null or v_actual=" + json(s.old) + " then\n";
  const create = `create or replace function public.${s.name}(${s.args}) returns ${s.result}\nlanguage plpgsql security definer set search_path = ''\nas $body$${s.body}$body$`;
  sql += `    execute $definition$${create}$definition$;\n`;
  const sig = s.old.args
    .split(", ")
    .map((a: string) => a.slice(a.indexOf(" ") + 1))
    .join(",");
  sql += `    alter function public.${s.name}(${sig}) owner to postgres;\n    revoke all on function public.${s.name}(${sig}) from public,anon,authenticated,service_role;\n    grant execute on function public.${s.name}(${sig}) to service_role;\n  end if;\n`;
}
sql += "end;\n$migration$;\n";
await writeFile(file, sql);
console.log(
  JSON.stringify({
    file,
    bytes: sql.length,
    profiles: [hostedPath, modernPath],
    targets: specs.map((s) => ({ name: s.name, oldBody: s.old.body, newBody: s.next.body })),
  }),
);
