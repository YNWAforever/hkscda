/** Task9 frozen composition: own zero-data clone, unchanged scanner, no Task1/8. */
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { resolve, dirname, relative } from "node:path";
import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import {
  captureProductionSchema,
  captureModernLocalSchema,
  createProductionClone,
  assertSafeFixtureTables,
  hash,
  snapshot,
  localSourceState,
  type Catalog,
} from "./productionSchemaClone";
import {
  fixtureScope,
  dependencies,
  functionsQuery,
} from "../../../docs/evidence/audit-remediation-20260927/r01-forward/task-9-profile";
import { checkReleaseSchema } from "../../../src/lib/operations/releaseSchema";
import { releaseManifest } from "../../../src/lib/operations/releaseManifest";
const root = resolve(import.meta.dir, "../../.."),
  mode = process.argv[2];
if (
  !["hosted", "modern"].includes(mode) ||
  process.env.R01_ADOPTION_ATOMIC_ALLOW_LOCAL_FIXTURES !== "1"
)
  throw Error("Explicit Task9 owned clone opt-in required");
const migration = "supabase/migrations/20261002045253_r01_adoption_atomic_forward.sql";
const paths = [
  migration,
  "src/lib/adoptions/atomicForward.database.test.ts",
  "src/lib/adoptions/atomicForward.http.test.ts",
  "src/lib/adoptions/http/shared.server.ts",
  "src/lib/adoptions/http/caseHandlers.server.ts",
  "src/lib/adoptions/repository.server.ts",
  "src/lib/adoptions/service.ts",
  "supabase/rls-tests/helpers/runR01AdoptionAtomic.ts",
  "supabase/rls-tests/helpers/productionSchemaClone.ts",
  "src/lib/operations/releaseSchema.ts",
  "src/lib/operations/releaseManifest.ts",
  ...["profile", "capture", "generate"].map(
    (n) => "docs/evidence/audit-remediation-20260927/r01-forward/task-9-" + n + ".ts",
  ),
  "docs/evidence/audit-remediation-20260927/r01-forward/task-9-generated-profiles.json",
  ...dependencies.map(([f]) => "supabase/migrations/" + f),
  ...[
    "20260925104926_atomic_adoption_coordinator_audit.sql",
    "20260926110000_manual_case_identity_search.sql",
    "20260926133000_expose_manual_adoption_case_rpc.sql",
  ].map((f) => "supabase/migrations/" + f),
  ...["hosted-1790916576452", "modern-1790916801651"].map(
    (n) =>
      ".superpowers/sdd/r01-forward-schema-plan-20261001/task-9-capture-" + n + "/receipt.json",
  ),
];
// Freeze actual local executable import closure as raw receipts, including test inputs.
for (let i = 0; i < paths.length; i++) {
  const path = paths[i];
  if (!path.endsWith(".ts")) continue;
  const source = await readFile(resolve(root, path), "utf8");
  for (const match of source.matchAll(/(?:from\s*|import\s*\()(["'])(\.[^"']+)\1/g)) {
    const absolute = resolve(dirname(resolve(root, path)), match[2]);
    const candidates = [
      absolute,
      absolute + ".ts",
      absolute + ".tsx",
      resolve(absolute, "index.ts"),
    ];
    const found = candidates.find((p) => existsSync(p) && /\.tsx?$/.test(p));
    if (!found) continue;
    const local = relative(root, found).replaceAll("\\", "/");
    if (local.startsWith("..")) throw Error("Executable import escapes assigned checkout");
    if (!paths.includes(local)) paths.push(local);
  }
}
const sourceBlobs = async () =>
  Object.fromEntries(
    await Promise.all(
      paths.map(async (p) => {
        const b = await readFile(resolve(root, p));
        const child = Bun.spawn(["git", "hash-object", "--no-filters", p], {
          cwd: root,
          stdout: "pipe",
        });
        return [
          p,
          {
            rawSha256: hash(b.toString()),
            canonicalSha256: hash(b.toString().replaceAll("\r\n", "\n")),
            gitBlob: (await new Response(child.stdout).text()).trim(),
          },
        ];
      }),
    ),
  );
const frozen = await sourceBlobs(),
  out = resolve(
    root,
    ".superpowers/sdd/r01-forward-schema-plan-20261001/task-9-" + mode + "-" + Date.now(),
  );
await mkdir(out, { recursive: true });
for (const [i, p] of paths.entries())
  await copyFile(resolve(root, p), resolve(out, "s" + String(i).padStart(3, "0") + ".source"));
const modern = "postgresql://postgres:postgres@127.0.0.1:57322/postgres",
  modernBefore = await localSourceState(modern);
const capture =
    mode === "hosted" ? await captureProductionSchema() : await captureModernLocalSchema(),
  clone = await createProductionClone(capture),
  db = clone.sql;
const receipt: Record<string, unknown> = {
  mode,
  out,
  at: new Date().toISOString(),
  sourceCommit: (
    await new Response(
      Bun.spawn(["git", "rev-parse", "HEAD"], { cwd: root, stdout: "pipe" }).stdout,
    ).text()
  ).trim(),
  sourceBase: "d0403a1869ea6dead498e62aebe9723e95c3ec19",
  clone: clone.name,
  schemaParity: true,
  zeroApplicationTables: clone.tableCount,
  managedPrerequisites: clone.prerequisites,
  catalogHash: hash(capture.catalog),
  fixtureScope,
  frozenInputs: frozen,
  archivedInputs: Object.fromEntries(
    paths.map((p, i) => [p, "s" + String(i).padStart(3, "0") + ".source"]),
  ),
  task1Applied: false,
  task8Applied: false,
  dependencyGate: "Task7 PR191 exactd040 CI36960650129 attempt1 five individualSUCCESS",
  productionActions: "schema/catalog only; no actor/rows/mutations/provider",
  environment:
    "only owned52322 clone; modern57322/template52322 readonly; no web/provider/email calls",
};
const rows = async () => {
  const values = [];
  for (const t of await db`select n.nspname||'.'||c.relname name from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind in ('r','p') union all select 'auth.users' order by 1`) {
    const [r] = await db.unsafe(
      `select count(*)::text count,md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' order by to_jsonb(t)::text),'')) hash from ${t.name} t`,
    );
    values.push([t.name, r]);
  }
  return hash(values);
};
const extra = async () => ({
  auth: await db`select c.relacl::text acl,(select jsonb_agg(jsonb_build_object('name',a.attname,'acl',a.attacl::text) order by a.attnum) from pg_attribute a where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped) columns from pg_class c where c.oid='auth.users'::regclass`,
  defaults:
    await db`select to_jsonb(d) value from pg_default_acl d order by d.defaclrole,d.defaclnamespace,d.defaclobjtype`,
  native:
    await db`select to_jsonb(t) trigger,(select jsonb_agg(to_jsonb(d) order by d.classid,d.objid,d.objsubid,d.refclassid,d.refobjid,d.refobjsubid,d.deptype) from pg_depend d where d.classid='pg_trigger'::regclass and d.objid=t.oid) dependencies from pg_trigger t where t.tgisinternal order by t.oid`,
  ledger:
    await db`select md5(coalesce(string_agg(to_jsonb(t)::text,E'\n' order by to_jsonb(t)::text),'')) hash from supabase_migrations.schema_migrations t`,
  sequences:
    await db`select schemaname,sequencename,last_value from pg_sequences where schemaname !~ '^pg_' order by 1,2`,
});
const names = [
  "mutate_adoption_coordinator_with_audit",
  "search_manual_case_identity",
  "create_manual_adoption_case",
];
const unaffected = (c: Catalog) =>
  Object.fromEntries(
    Object.entries(c).map(([k, v]) => [
      k,
      Array.isArray(v)
        ? v.filter(
            (e: Record<string, unknown>) =>
              !(k === "functions" && e.schema === "public" && names.includes(String(e.name))),
          )
        : v,
    ]),
  );
const helpers = async () =>
  hash(
    (await db.unsafe(functionsQuery)).filter(
      (f: Record<string, unknown>) => !(f.schema === "public" && names.includes(String(f.name))),
    ),
  );
async function gap(c: Catalog) {
  const es = (k: string) => (c[k] ?? []) as Record<string, unknown>[];
  const result = await checkReleaseSchema(
    {
      async load() {
        return {
          tables: es("relations")
            .filter((e) => ["r", "p"].includes(String(e.kind)))
            .map((e) => ({
              schema: String(e.schema),
              name: String(e.name),
              rls: Boolean(e.rls),
              columns: Object.fromEntries(
                es("columns")
                  .filter((x) => x.schema === e.schema && x.table === e.name)
                  .map((x) => [String(x.name), String(x.type)]),
              ),
              grants: Object.fromEntries(
                ["anon", "authenticated", "service_role"].map((r) => [
                  r,
                  ((e.acl ?? []) as { grantee: string; privilege: string }[])
                    .filter((a) => a.grantee === r)
                    .map((a) => a.privilege),
                ]),
              ),
            })),
          functions: es("functions").map((e) => ({
            schema: String(e.schema),
            name: String(e.name),
            arguments: String(e.args),
            returns: String(e.result),
            executeRoles: ((e.acl ?? []) as { grantee: string; privilege: string }[])
              .filter((a) => a.privilege === "EXECUTE")
              .map((a) => a.grantee),
          })),
          migrationVersions: [],
        };
      },
    },
    releaseManifest,
  );
  return result.issues.length;
}
const forced = new Error("Task9 forced baseline rollback");
const apply = async () =>
  db.begin(async (tx) => {
    await tx`set local role postgres`;
    await tx.unsafe(await readFile(resolve(root, migration), "utf8"));
  });
try {
  await assertSafeFixtureTables(db, fixtureScope);
  receipt.fixtureSafety = "unchanged5352 fullscope PASS";
  receipt.initialGapCount = await gap(capture.catalog);
  const deps = [];
  for (const [file, expected] of dependencies) {
    const source = await readFile(resolve(root, "supabase/migrations", file), "utf8");
    if (hash(source) !== expected) throw Error("Accepted source dependency bytes differ " + file);
    await db.begin(async (tx) => {
      await tx`set local role postgres`;
      await tx.unsafe(source);
    });
    deps.push({ file, sha256: expected, gapCount: await gap(await snapshot(db)) });
  }
  receipt.dependencies = deps;
  const actor = randomUUID(),
    status = randomUUID(),
    supporter = randomUUID();
  await db.begin(async (tx) => {
    await tx`set local role postgres`;
    await tx`insert into auth.users(id,email,email_confirmed_at) values(${actor}::uuid,${actor + "@example.invalid"},now())`;
    await tx`insert into public.admin_user(auth_user_id,email,role,status) values(${actor}::uuid,${actor + "@example.invalid"},'admin','active')`;
    await tx`insert into public.coordinator_status(id,category,key,label_zh,label_en) values(${status}::uuid,'adoption_case',${"preserved_" + status.replaceAll("-", "")},'Synthetic preserved','Synthetic preserved')`;
    await tx`insert into public.supporter(id,name) values(${supporter}::uuid,'Synthetic preserved supporter')`;
    await tx`insert into public.audit_log(actor_user_id,action,entity,entity_id,detail) values(${actor}::uuid,'synthetic.preserved','task9',${actor},'{}'::jsonb)`;
  });
  const before = await snapshot(db),
    beforeRows = await rows(),
    beforeExtra = hash(await extra()),
    beforeHelpers = await helpers();
  receipt.beforeGapCount = await gap(before);
  receipt.beforeRowsHash = beforeRows;
  receipt.beforeCompleteAuthDefaultNativeLedgerSequenceHash = beforeExtra;
  receipt.beforeHelperHash = beforeHelpers;
  if (mode === "hosted" && receipt.beforeGapCount !== 20)
    throw Error("Ruling28 conditional baseline is20 with pendingTask8 retained");
  let accepted = false;
  try {
    await db.begin(async (tx) => {
      await tx`set local role postgres`;
      await tx.unsafe(await readFile(resolve(root, migration), "utf8"));
      const [r] =
        await tx`select to_regprocedure('public.mutate_adoption_coordinator_with_audit(uuid,text,text,uuid,jsonb)') coordinator,to_regprocedure('public.search_manual_case_identity(text,integer,integer)') search,to_regprocedure('public.create_manual_adoption_case(uuid,jsonb,jsonb,jsonb)') manual`;
      if (!r.coordinator || !r.search || !r.manual) throw Error("Baseline omitted target");
      accepted = true;
      throw forced;
    });
  } catch (e) {
    if (e !== forced) throw e;
  }
  receipt.baselineAcceptedBeforeNegatives = accepted;
  receipt.baselineRollbackPreserved =
    hash(before) === hash(await snapshot(db)) &&
    beforeRows === (await rows()) &&
    beforeExtra === hash(await extra()) &&
    beforeHelpers === (await helpers());
  if (!accepted || !receipt.baselineRollbackPreserved)
    throw Error("Meaningful baseline rollback failed");
  const refusals: { name: string; setup: string }[] = [
    {
      name: "table owner",
      setup:
        "set local role supabase_admin;alter table public.coordinator_status owner to supabase_admin;set local role postgres",
    },
    { name: "RLS", setup: "alter table public.adoption_case disable row level security" },
    {
      name: "column ACL",
      setup: "grant update(applicant_phone) on public.adoption_case to authenticated",
    },
    {
      name: "column default",
      setup: "alter table public.coordinator_status alter column is_active set default false",
    },
    {
      name: "unknown index",
      setup: "create index task9_unknown_idx on public.coordinator_status(label_en)",
    },
    {
      name: "version trigger disabled",
      setup:
        "alter table public.adoption_case disable trigger adoption_case_bulk_row_version_before_update",
    },
    {
      name: "creator public recipient",
      setup:
        "alter default privileges for role postgres in schema public grant execute on functions to dashboard_user",
    },
    {
      name: "creator public grant option",
      setup:
        "alter default privileges for role postgres in schema public grant execute on functions to service_role with grant option",
    },
    {
      name: "creator global recipient",
      setup: "alter default privileges for role postgres grant execute on functions to anon",
    },
    {
      name: "Auth effective SELECT column",
      setup: "grant select(banned_until) on auth.users to service_role",
    },
    {
      name: "Auth effective UPDATE column",
      setup:
        "set local role supabase_admin;grant update(banned_until) on auth.users to service_role;set local role postgres",
    },
  ];
  const helperRows = await db.unsafe(functionsQuery);
  for (const f of helperRows.filter(
    (f: Record<string, unknown>) => !(f.schema === "public" && names.includes(String(f.name))),
  )) {
    const signature =
      f.schema +
      "." +
      f.name +
      "(" +
      (f.args as string)
        .split(",")
        .map((s) => s.trim().split(" ").slice(1).join(" "))
        .join(",") +
      ")";
    for (const [facet, setup] of [
      [
        "owner",
        `set local role supabase_admin;alter function ${signature} owner to supabase_admin;set local role postgres`,
      ],
      ["ACL", `grant execute on function ${signature} to dashboard_user`],
      ["grant option", `grant execute on function ${signature} to service_role with grant option`],
      ["config", `alter function ${signature} set search_path='pg_catalog'`],
    ] as const) {
      if (f.owner === "supabase_auth_admin" && facet === "ACL") continue;
      if (f.owner === "supabase_auth_admin" && facet === "owner") continue;
      refusals.push({
        name: f.schema + "." + f.name + " " + facet,
        setup:
          f.owner === "supabase_auth_admin"
            ? "set local role supabase_admin;" + setup + ";set local role postgres"
            : setup,
      });
    }
  }
  refusals.push({
    name: "private helper intentional default",
    setup:
      "do $drift$ begin execute replace(pg_get_functiondef('private.create_manual_adoption_case(uuid,jsonb,jsonb,jsonb)'::regprocedure),'p_initial_task jsonb DEFAULT NULL::jsonb','p_initial_task jsonb DEFAULT ''{}''::jsonb');end $drift$",
  });
  for (const [name, sig, legacy] of [
    [
      "mutate_adoption_coordinator_with_audit",
      "uuid,text,text,uuid,jsonb",
      "20260925104926_atomic_adoption_coordinator_audit.sql",
    ],
    [
      "search_manual_case_identity",
      "text,integer,integer",
      "20260926110000_manual_case_identity_search.sql",
    ],
    [
      "create_manual_adoption_case",
      "uuid,jsonb,jsonb,jsonb",
      "20260926133000_expose_manual_adoption_case_rpc.sql",
    ],
  ] as const) {
    const legacySource = await readFile(resolve(root, "supabase/migrations", legacy), "utf8");
    for (const [facet, drift] of [
      [
        "owner",
        `set local role supabase_admin;alter function public.${name}(${sig}) owner to supabase_admin;set local role postgres`,
      ],
      ["ACL", `grant execute on function public.${name}(${sig}) to dashboard_user`],
      [
        "grant option",
        `grant execute on function public.${name}(${sig}) to service_role with grant option`,
      ],
      ["config", `alter function public.${name}(${sig}) set search_path='pg_catalog'`],
      [
        "defaults",
        `do $drift$ begin execute replace(pg_get_functiondef('public.${name}(${sig})'::regprocedure),'${name === "search_manual_case_identity" ? "p_page integer DEFAULT 1" : name === "create_manual_adoption_case" ? "p_initial_task jsonb DEFAULT NULL::jsonb" : "p_payload jsonb"}','${name === "search_manual_case_identity" ? "p_page integer DEFAULT 2" : name === "create_manual_adoption_case" ? "p_initial_task jsonb DEFAULT ''{}''::jsonb" : "p_payload jsonb DEFAULT ''{}''::jsonb"}');end $drift$`,
      ],
      [
        "overload",
        `create function public.${name}(uuid) returns jsonb language sql as $x$select '{}'::jsonb$x$`,
      ],
      [
        "body",
        `create or replace function public.${name}(${name === "search_manual_case_identity" ? "p_query text,p_page integer default1,p_page_size integer default10" : name === "create_manual_adoption_case" ? "p_actor_user_id uuid,p_identity jsonb,p_case jsonb,p_initial_task jsonb default null" : "p_actor_user_id uuid,p_entity text,p_operation text,p_id uuid,p_payload jsonb"}) returns jsonb language sql ${name === "search_manual_case_identity" ? "stable" : ""} ${name === "search_manual_case_identity" ? "" : "security definer"} set search_path=public,pg_temp as $x$select '{}'::jsonb$x$`,
      ],
    ] as const)
      refusals.push({
        name: "target " + name + " " + facet,
        setup:
          legacySource +
          "\n" +
          drift.replaceAll("default1", "default 1").replaceAll("default10", "default 10"),
      });
  }
  const [t] =
    await db`select t.tgname from pg_trigger t where t.tgrelid='public.adoption_case'::regclass and t.tgisinternal limit 1`;
  refusals.push({
    name: "native FK trigger disabled",
    setup:
      'set local role supabase_admin;alter table public.adoption_case disable trigger "' +
      String(t.tgname).replaceAll('"', '""') +
      '";set local role postgres',
  });
  const actualRefusals = [];
  receipt.refusals = actualRefusals;
  for (const f of refusals) {
    let errno = "success";
    try {
      await db.begin(async (tx) => {
        await tx`set local role postgres`;
        await tx.unsafe(f.setup);
        await tx.unsafe(await readFile(resolve(root, migration), "utf8"));
        throw Error("Expected55000 refusal " + f.name);
      });
    } catch (e) {
      errno = (e as { errno?: string }).errno ?? String(e);
    }
    if (errno !== "55000") throw Error("Wrong refusal " + f.name + ": " + errno);
    if (
      hash(before) !== hash(await snapshot(db)) ||
      beforeRows !== (await rows()) ||
      beforeExtra !== hash(await extra()) ||
      beforeHelpers !== (await helpers())
    )
      throw Error("Refusal rollback drift " + f.name);
    actualRefusals.push({ name: f.name, errno, fullRollback: true });
  }
  receipt.refusals = actualRefusals;
  await apply();
  const first = await snapshot(db);
  await apply();
  const second = await snapshot(db);
  receipt.applies = 2;
  receipt.secondApplyIdempotent = hash(first) === hash(second);
  receipt.afterGapCount = await gap(second);
  receipt.unaffectedCatalogPreserved = hash(unaffected(before)) === hash(unaffected(second));
  receipt.rowsPreserved = beforeRows === (await rows());
  receipt.completeAuthDefaultNativeLedgerSequencePreserved = beforeExtra === hash(await extra());
  receipt.helpersPreserved = beforeHelpers === (await helpers());
  receipt.finalFunctions = (await db.unsafe(functionsQuery)).filter(
    (f: Record<string, unknown>) => f.schema === "public" && names.includes(String(f.name)),
  );
  if (mode === "hosted" && receipt.afterGapCount !== 17)
    throw Error("Ruling28 conditional aftercount17 required");
  for (const k of [
    "secondApplyIdempotent",
    "unaffectedCatalogPreserved",
    "rowsPreserved",
    "completeAuthDefaultNativeLedgerSequencePreserved",
    "helpersPreserved",
  ])
    if (!receipt[k]) throw Error("Migration preservation failed " + k);
  const args = [
    "bun",
    "test",
    "--timeout",
    "15000",
    "src/lib/adoptions/atomicForward.database.test.ts",
    "src/lib/adoptions/atomicForward.http.test.ts",
  ];
  const p = Bun.spawn(args, {
    cwd: root,
    env: { ...process.env, R01_ADOPTION_ATOMIC_TEST_DATABASE_URL: clone.url },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exit] = await Promise.all([
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
    p.exited,
  ]);
  await writeFile(resolve(out, "tests.log"), stdout + stderr);
  receipt.testCommand = args;
  receipt.testExit = exit;
  receipt.testSummary = (stdout + stderr)
    .split("\n")
    .filter((s) => /^ \d+ (pass|fail|skip|expect)/.test(s));
  console.log(stdout + stderr);
  receipt.postTestsCatalogPreserved = hash(second) === hash(await snapshot(db));
  receipt.postTestsRowsPreserved = beforeRows === (await rows());
  receipt.postTestsCompleteMetadataPreserved = beforeExtra === hash(await extra());
  if (
    exit ||
    !receipt.postTestsCatalogPreserved ||
    !receipt.postTestsRowsPreserved ||
    !receipt.postTestsCompleteMetadataPreserved
  )
    throw Error("Actual Task9 tests or full preservation failed");
} catch (e) {
  receipt.error = String(e);
  process.exitCode = 1;
} finally {
  await clone.close();
  receipt.normalDrop = true;
  receipt.templatePreserved = clone.templatePreserved;
  receipt.modernPreserved = modernBefore === (await localSourceState(modern));
  receipt.frozenInputsPreserved = hash(frozen) === hash(await sourceBlobs());
  await writeFile(resolve(out, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
  console.log(
    JSON.stringify({
      out,
      mode,
      error: receipt.error,
      testExit: receipt.testExit,
      summary: receipt.testSummary,
      refusals: (receipt.refusals as unknown[] | undefined)?.length,
      gaps: [receipt.beforeGapCount, receipt.afterGapCount],
      normalDrop: receipt.normalDrop,
      templatePreserved: receipt.templatePreserved,
      modernPreserved: receipt.modernPreserved,
      frozenInputsPreserved: receipt.frozenInputsPreserved,
    }),
  );
}
