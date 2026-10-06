import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
import { catalogQuery, hash } from "../../../../supabase/rls-tests/helpers/productionSchemaClone";
import {
  functionsQuery,
  authQuery,
  nativeQuery,
  indexDetailsQuery,
  names,
  tables,
  shapesQuery,
} from "./task-11-profile";
import { targetDefinitions, signatures } from "./task-11-targets";
import { assertCapture } from "./task-11-receipt";
import { verifyNativeQualification, correlatedNativeGuards } from "./task-11-native-profile";
import { verifyColdEvidence, withObservedPairs } from "./task-11-cold-profile";
const root = process.cwd();
const inputPath = process.argv[2],
  file = process.argv[3];
if (
  !inputPath ||
  !/^supabase\/migrations\/\d{14}_r01_finance_callback_forward\.sql$/.test(file ?? "")
)
  throw Error("Actual CLI-created Task11 migration and inputs required");
const out = resolve(
  ".superpowers/sdd/r01-forward-schema-plan-20261001/task-11-generator-" + Date.now(),
);
await mkdir(out, { recursive: true });
await copyFile(
  "docs/evidence/audit-remediation-20260927/r01-forward/task-11-generate.ts",
  resolve(out, "executed-generator.source"),
);
await writeFile(
  resolve(out, "invocation.json"),
  JSON.stringify({ args: process.argv.slice(2), at: new Date().toISOString() }, null, 2) + "\n",
);
const inputs = JSON.parse(await readFile(inputPath, "utf8"));
if (!Array.isArray(inputs.captures) || inputs.captures.length !== 3)
  throw Error("Exact hosted/modern/component capture triple required");
const profiles = await Promise.all(
  inputs.captures.map(async (p: string, i: number) => {
    const r = assertCapture(
      JSON.parse(await readFile(p, "utf8")),
      (["hosted", "modern", "component"] as const)[i],
    );
    for (const [path, entry] of Object.entries(
      r.bindings as Record<string, Record<string, string>>,
    )) {
      const b = await readFile(resolve(root, path));
      const archive = await readFile(resolve(dirname(p), entry.archive));
      const sha = createHash("sha256").update(b).digest("hex");
      if (!b.equals(archive) || sha !== entry.rawSha256)
        throw Error("Actual captured input/archive differs " + path);
    }
    return r;
  }),
);
if (typeof inputs.nativePrerequisite !== "string")
  throw Error("Exact separately qualified native prerequisite required");
const native = await verifyNativeQualification(
  JSON.parse(await readFile(inputs.nativePrerequisite, "utf8")),
  root,
  dirname(inputs.nativePrerequisite),
);
const cold = await verifyColdEvidence(root);
const defs = await targetDefinitions(root);
const generationPaths = [
  ...new Set([
    "docs/evidence/audit-remediation-20260927/r01-forward/task-11-generate.ts",
    "docs/evidence/audit-remediation-20260927/r01-forward/task-11-receipt.ts",
    inputPath,
    ...inputs.captures,
    inputs.nativePrerequisite,
    "docs/evidence/audit-remediation-20260927/r01-forward/task-11-native-profile.ts",
    "docs/evidence/audit-remediation-20260927/r01-forward/task-11-cold-profile.ts",
    ...cold.paths,
    ...Object.keys(native.bindings),
    ...profiles.flatMap((p) => Object.keys(p.bindings as Record<string, unknown>)),
  ]),
];
const frozenInputs: Record<string, Record<string, unknown>> = {};
for (const [i, path] of generationPaths.entries()) {
  const bytes = await readFile(resolve(root, path));
  const proc = Bun.spawn(["git", "hash-object", "--no-filters", resolve(root, path)], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const [blob, error, exit] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (exit || error) throw Error("Generator input binding failed:" + path);
  frozenInputs[path] = {
    rawSha256: createHash("sha256").update(bytes).digest("hex"),
    canonicalSha256: hash(bytes.toString().replaceAll("\r\n", "\n")),
    rawGitBlob: blob.trim(),
    rawBytes: bytes.length,
    archive: "s" + i + ".source",
  };
  await writeFile(resolve(out, "s" + i + ".source"), bytes);
}
const json = (v: unknown) => "'" + JSON.stringify(v).replaceAll("'", "''") + "'::jsonb";
const unique = (items: unknown[]) => [...new Map(items.map((v) => [hash(v), v])).values()];
const globalKeys = [
  "schemas",
  "defaults",
  "roles",
  "memberships",
  "extensions",
  "extensionMembers",
  "databaseOwner",
  "sequences",
];
const scopedKeys = ["relations", "columns", "constraints", "indexes", "triggers", "policies"];
const withoutTargets = (catalog: Record<string, unknown>) =>
  Object.fromEntries([
    ...globalKeys.map((k) => [k, catalog[k]]),
    ...scopedKeys.map((k) => [
      k,
      (catalog[k] as Record<string, unknown>[]).filter(
        (f) => f.schema === "public" && tables.includes(String(f.table ?? f.name)),
      ),
    ]),
    [
      "types",
      (catalog.types as Record<string, unknown>[]).filter(
        (f) =>
          f.schema === "public" &&
          (tables.includes(String(f.name)) ||
            tables.some((t) => "_" + t === f.name) ||
            (f.kind !== "c" && !String(f.name).startsWith("_"))),
      ),
    ],
  ]);
const tableArray = "array[" + tables.map((n) => "'" + n + "'").join(",") + "]";
const projectionSql = `pg_catalog.jsonb_build_object(${[
  ...globalKeys.map((k) => "'" + k + "',v_catalog->'" + k + "'"),
  ...scopedKeys.map(
    (k) =>
      "'" +
      k +
      "',(select coalesce(pg_catalog.jsonb_agg(f.value order by f.ordinality),'[]'::jsonb) from pg_catalog.jsonb_array_elements(v_catalog->'" +
      k +
      "') with ordinality f(value,ordinality) where f.value->>'schema'='public' and coalesce(f.value->>'table',f.value->>'name')=any(" +
      tableArray +
      "))",
  ),
  "'types',(select coalesce(pg_catalog.jsonb_agg(f.value order by f.ordinality),'[]'::jsonb) from pg_catalog.jsonb_array_elements(v_catalog->'types') with ordinality f(value,ordinality) where f.value->>'schema'='public' and ((f.value->>'name')=any(" +
    tableArray +
    ") or substring(f.value->>'name' from 2)=any(" +
    tableArray +
    ") and left(f.value->>'name',1)='_' or f.value->>'kind'<>'c' and left(f.value->>'name',1)<>'_'))",
].join(",")})`;
const helpers = profiles.map((p) =>
  (p.functions as Record<string, unknown>[]).filter(
    (f) => !(f.schema === "public" && names.includes(String(f.name))),
  ),
);
const historicalGuards = correlatedNativeGuards(
  unique(profiles.map((p) => withoutTargets(p.catalog as Record<string, unknown>))).map(json),
  unique(helpers).map(json),
  json(native.pair.catalog),
  json(native.pair.helpers),
);
const nativeGuards = withObservedPairs(historicalGuards, cold.evidence.profiles.map((p) => ({
  catalog: json(p.pair.catalog), helpers: json(p.pair.helpers),
})));
let sql = `-- R01 Task11: exact five target closure; two manual actor fences, Ruling48.\n-- Ruling57: complete native catalogue/helper pair remains correlated.\n-- No data/backfill/provider/email/checkout/schedule change.\nset local search_path = '';\ndo $migration$\ndeclare v_catalog jsonb;v_actual jsonb;v_before jsonb;v_fn oid;v_native boolean;v_observed integer;\nbegin\n if current_user<>'postgres' then raise exception 'R01 finance owner context differs' using errcode='55000';end if;\n select catalog into v_catalog from (${catalogQuery}) captured;\n v_before:=${projectionSql};\n${nativeGuards.catalog} if exists(select 1 from pg_catalog.pg_roles b cross join pg_catalog.pg_roles s where b.rolname in('anon','authenticated') and s.rolname in('service_role','postgres','supabase_admin') and (pg_catalog.pg_has_role(b.oid,s.oid,'USAGE') or pg_catalog.pg_has_role(b.oid,s.oid,'SET'))) then raise exception 'R01 finance effective browser access differs' using errcode='55000';end if;\n`;
for (const [label, query, key] of [
  ["Auth", authQuery, "auth"],
  ["native", nativeQuery, "native"],
  ["indexes", indexDetailsQuery, "indexes"],
  ["relation shapes", shapesQuery, "shapes"],
])
  sql += ` select value into v_actual from (${query}) captured;\n if v_actual not in(${unique(
    profiles.map((p) => p[key]),
  )
    .map(json)
    .join(
      ",",
    )}) then raise exception 'R01 finance ${label} prerequisite differs' using errcode='55000';end if;\n`;
sql += ` select coalesce(pg_catalog.jsonb_agg(to_jsonb(f) order by f.schema,f.name,f.args),'[]'::jsonb) into v_actual from (${functionsQuery}) f where not(f.schema='public' and f.name=any(array[${names.map((n) => "'" + n + "'").join(",")}]));\n${nativeGuards.helpers}`;
// Validate ALL targets first, so an unknown later function cannot hide behind earlier DDL.
for (const name of names) {
  const allowed = unique(
    profiles.flatMap((p) =>
      [p.oldTargets, p.nextTargets].map((ts) =>
        (ts as Record<string, unknown>[]).filter((t) => t.name === name),
      ),
    ),
  );
  sql += ` select coalesce(pg_catalog.jsonb_agg(to_jsonb(f) order by f.schema,f.name,f.args),'[]'::jsonb) into v_actual from (${functionsQuery}) f where f.schema='public' and f.name='${name}';\n if v_actual<>'[]'::jsonb and v_actual not in(${allowed.map(json).join(",")}) then raise exception 'R01 finance target tuple differs:${name}' using errcode='55000';end if;\n`;
}
for (const [i, name] of names.entries()) {
  const expected = unique(
    profiles.map((p) =>
      (p.nextTargets as Record<string, unknown>[]).filter((t) => t.name === name),
    ),
  );
  sql += ` select coalesce(pg_catalog.jsonb_agg(to_jsonb(f) order by f.schema,f.name,f.args),'[]'::jsonb) into v_actual from (${functionsQuery}) f where f.schema='public' and f.name='${name}';\n if v_actual not in(${expected.map(json).join(",")}) then\n execute $definition$${defs[i].next}$definition$;\n end if;\n`;
}
sql += ` select catalog into v_catalog from (${catalogQuery}) captured;\n v_actual:=${projectionSql};\n if v_actual<>v_before then raise exception 'R01 finance unintended catalog drift' using errcode='55000';end if;\n`;
for (const [i, name] of names.entries()) {
  const expected = unique(
    profiles.map((p) =>
      (p.nextTargets as Record<string, unknown>[]).filter((t) => t.name === name),
    ),
  );
  sql += ` select coalesce(pg_catalog.jsonb_agg(to_jsonb(f) order by f.schema,f.name,f.args),'[]'::jsonb) into v_actual from (${functionsQuery}) f where f.schema='public' and f.name='${name}';\n if v_actual not in(${expected.map(json).join(",")}) then raise exception 'R01 finance final target tuple differs:${name}' using errcode='55000';end if;\n v_fn:=pg_catalog.to_regprocedure('public.${name}(${signatures[i]})');\n if v_fn is null or pg_catalog.has_function_privilege('anon',v_fn,'EXECUTE') or pg_catalog.has_function_privilege('authenticated',v_fn,'EXECUTE') or not pg_catalog.has_function_privilege('service_role',v_fn,'EXECUTE') then raise exception 'R01 finance final effective grants differ:${name}' using errcode='55000';end if;\n`;
}
sql += "end;\n$migration$;\n";
await copyFile(inputPath, resolve(out, "profile-inputs.source"));
await writeFile(file, sql);
const frozenInputsPreserved = (
  await Promise.all(
    Object.entries(frozenInputs).map(
      async ([p, b]) =>
        createHash("sha256")
          .update(await readFile(resolve(root, p)))
          .digest("hex") === b.rawSha256,
    ),
  )
).every((v) => v === true);
if (!frozenInputsPreserved || sql.includes("\r"))
  throw Error("Generator frozen input or exact LF invariant failed");
await writeFile(
  resolve(out, "receipt.json"),
  JSON.stringify(
    {
      receiptType: "generator",
      mode: "three-profile",
      error: null,
      failedFinalFlags: [],
      requiredFinalFlags: [
        "qualifiedCaptures",
        "qualifiedNativePair",
        "correlatedNativePair",
        "exactLF",
        "frozenInputsPreserved",
      ],
      qualifiedCaptures: true,
      qualifiedNativePair: true,
      correlatedNativePair: true,
      exactLF: true,
      frozenInputsPreserved,
      at: new Date().toISOString(),
      file,
      sha256: hash(sql),
      bytes: Buffer.byteLength(sql),
      inputs: inputs.captures,
      targets: 5,
      profileCount: 3,
      nativePrerequisite: inputs.nativePrerequisite,
      supplementalProfileCount: 1,
      observedControlAclProfileCount: cold.evidence.profiles.length,
      observedControlAclSourceBase: cold.evidence.sourceBase,
      frozenInputs,
    },
    null,
    2,
  ) + "\n",
);
console.log(JSON.stringify({ file, sha256: hash(sql), bytes: Buffer.byteLength(sql), out }));
