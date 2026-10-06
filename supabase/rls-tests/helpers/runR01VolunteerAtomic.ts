/** Task8 new owned synthetic clones; no legacy replay, production rows or providers. */
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  captureProductionSchema,
  captureModernLocalSchema,
  createProductionClone,
  assertSafeFixtureTables,
  snapshot,
  hash,
  localSourceState,
  type Catalog,
} from "./productionSchemaClone";
import {
  tables,
  fixtureScope,
  targets,
  functionsQuery,
  targetQuery,
  authQuery,
  nativeQuery,
  indexDetailsQuery,
  shapeQuery,
} from "../../../docs/evidence/audit-remediation-20260927/r01-forward/task-8-profile";
const root = resolve(import.meta.dir, "../../.."),
  mode = process.argv[2];
if (
  process.env.R01_VOLUNTEER_ALLOW_LOCAL_FIXTURES !== "1" ||
  !["capture-hosted", "capture-modern", "hosted", "modern"].includes(mode)
)
  throw Error("Explicit owned Task8 mode required");
const out = resolve(
  root,
  "docs/evidence/audit-remediation-20260927/r01-forward/task-8-atomic-receipts",
  mode + "-" + Date.now(),
);
await mkdir(out, { recursive: true });
await writeFile(resolve(out, ".gitattributes"), "* -text\n");
const migration = process.env.R01_VOLUNTEER_MIGRATION;
if (
  !mode.startsWith("capture") &&
  (!migration || !/^supabase\/migrations\/\d{14}_r01_volunteer_atomic_forward.sql$/.test(migration))
)
  throw Error("Exact Task8 migration path required");
const paths = [
  "supabase/rls-tests/helpers/productionSchemaClone.ts",
  "supabase/rls-tests/helpers/runR01VolunteerAtomic.ts",
  "docs/evidence/audit-remediation-20260927/r01-forward/task-8-profile.ts",
  "docs/evidence/audit-remediation-20260927/r01-forward/task-8-generate.ts",
  "src/lib/volunteers/atomicForward.database.test.ts",
  "src/lib/volunteers/repository.server.ts",
  "src/lib/volunteers/service.ts",
  "supabase/migrations/20260925104051_volunteer_public_registration_idempotency.sql",
  ...(migration ? [migration] : []),
];
const blobs = async () =>
  Object.fromEntries(
    await Promise.all(paths.map(async (p) => [p, hash(await readFile(resolve(root, p), "utf8"))])),
  );
const frozen = await blobs();
for (const [i, p] of paths.entries())
  await copyFile(resolve(root, p), resolve(out, `s${String(i).padStart(3, "0")}.source`));
const modern = "postgresql://postgres:postgres@127.0.0.1:57322/postgres",
  modernBefore = await localSourceState(modern);
const capture = mode.endsWith("hosted")
    ? await captureProductionSchema()
    : await captureModernLocalSchema(),
  clone = await createProductionClone(capture),
  db = clone.sql;
const receipt: Record<string, unknown> = {
  mode,
  out,
  at: new Date().toISOString(),
  clone: clone.name,
  sourceCommit: (
    await new Response(
      Bun.spawn(["git", "rev-parse", "HEAD"], { cwd: root, stdout: "pipe" }).stdout,
    ).text()
  ).trim(),
  schemaParity: true,
  zeroApplicationTables: clone.tableCount,
  managedPrerequisites: clone.prerequisites,
  sourceCatalogHash: hash(capture.catalog),
  frozenInputs: frozen,
  fixtureScope,
  migration,
  task1Applied: false,
  dependencySqlApplied: false,
  environment: "owned52322 clone only; template52322/modern57322 readonly; no web/provider/email",
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
  auth: (await db.unsafe(authQuery))[0].value,
  shape: (await db.unsafe(shapeQuery))[0].value,
  defaults:
    await db`select to_jsonb(d) value from pg_default_acl d order by d.defaclrole,d.defaclnamespace,d.defaclobjtype`,
  native:
    await db`select to_jsonb(t) value,(select jsonb_agg(to_jsonb(d) order by d.classid,d.objid,d.objsubid,d.refclassid,d.refobjid,d.refobjsubid,d.deptype) from pg_depend d where d.classid='pg_trigger'::regclass and d.objid=t.oid) dependencies from pg_trigger t where t.tgisinternal order by t.oid`,
  ledger:
    await db`select md5(coalesce(string_agg(to_jsonb(t)::text,E'\n' order by to_jsonb(t)::text),'')) hash from supabase_migrations.schema_migrations t`,
  sequences:
    await db`select schemaname,sequencename,last_value from pg_sequences where schemaname !~ '^pg_' order by 1,2`,
});
const unaffected = (c: Catalog) => ({
  ...c,
  functions: (c.functions as { schema: string; name: string }[]).filter(
    (f) => f.schema !== "public" || !targets.includes(f.name),
  ),
});
try {
  await assertSafeFixtureTables(db, fixtureScope);
  const catalog = await snapshot(db),
    beforeHelpers = (await db.unsafe(functionsQuery))[0].value;
  const profile = {
    catalog,
    functions: beforeHelpers,
    targets: (await db.unsafe(targetQuery))[0].value,
    auth: (await db.unsafe(authQuery))[0].value,
    native: (await db.unsafe(nativeQuery))[0].value,
    indexes: (await db.unsafe(indexDetailsQuery))[0].value,
    shape: (await db.unsafe(shapeQuery))[0].value,
  };
  receipt.profile = profile;
  await writeFile(resolve(out, "profile.json"), JSON.stringify(profile, null, 2) + "\n");
  if (!mode.startsWith("capture")) {
    const source = await readFile(resolve(root, migration!), "utf8");
    // Keep existing synthetic facts across both applies and all behavioral tests.
    await db.begin(async (tx) => {
      await tx`set local role postgres`;
      await tx`insert into public.volunteer_activity(id,type,title,starts_at,ends_at,location,capacity,status) values('00000000-0000-4000-8000-000000000008','cleaning_day','Synthetic preserved Task8','2000-01-01T00:00:00Z','2000-01-01T03:00:00Z','Owned clone',1,'draft')`;
      await tx`insert into public.audit_log(action,entity,entity_id,detail) values('synthetic.preserved','task8','preserved','{}'::jsonb)`;
    });
    const beforeRows = await rows(),
      beforeExtra = hash(await extra());
    const beforeShape = hash((await db.unsafe(shapeQuery))[0].value);
    receipt.beforeRowsHash = beforeRows;
    receipt.beforeExtraHash = beforeExtra;
    const forced = Error("Task8 deliberate migration transaction rollback");
    try {
      await db.begin(async (tx) => {
        await tx`set local role postgres`;
        await tx.unsafe(source);
        throw forced;
      });
    } catch (e) {
      if (e !== forced) throw e;
    }
    receipt.baselineRollbackPreserved =
      hash(catalog) === hash(await snapshot(db)) &&
      beforeRows === (await rows()) &&
      beforeShape === hash((await db.unsafe(shapeQuery))[0].value) &&
      beforeExtra === hash(await extra());
    const regsig =
      "uuid,uuid,text,integer,text,text,text,text,text,integer,integer,text,text,text,text,timestamptz,boolean,boolean";
    const negatives = [
      ["owner context", "set local role service_role"],
      [
        "table owner",
        "set local role supabase_admin;alter table public.volunteer_activity owner to service_role;set local role postgres",
      ],
      [
        "column constraint",
        "alter table public.volunteer_registration alter column contact_phone drop not null",
      ],
      [
        "helper grant option",
        `grant execute on function public.create_volunteer_registration(${regsig}) to authenticated with grant option`,
      ],
      ["helper config", "alter function public.record_public_consent_intents() set search_path=''"],
      [
        "default ACL",
        "alter default privileges for role postgres in schema public grant execute on functions to authenticated with grant option",
      ],
      [
        "modern policy trigger",
        "alter table public.volunteer_registration disable trigger volunteer_registration_policy",
      ],
      [
        "unexpected target overload",
        "create function public.clone_volunteer_activity_with_audit(uuid) returns uuid language sql as 'select $1'",
      ],
      [
        "rewrite rule",
        "create rule task8_admission_probe as on insert to public.volunteer_activity do also select 1",
      ],
      [
        "descendant inheritance",
        "create table public.task8_admission_child () inherits (public.volunteer_activity)",
      ],
      [
        "ancestor inheritance",
        "create table public.task8_admission_parent ();alter table public.volunteer_activity inherit public.task8_admission_parent",
      ],
      ["unlogged persistence", "alter table public.audit_log set unlogged"],
    ];
    const refusals = [];
    receipt.refusals = refusals;
    for (const [name, setup] of negatives) {
      let code = "success";
      try {
        await db.begin(async (tx) => {
          await tx`set local role postgres`;
          await tx.unsafe(setup);
          await tx.unsafe(source);
          throw forced;
        });
      } catch (e) {
        if (e !== forced) code = (e as { errno?: string }).errno ?? "unexpected";
      }
      const preserved =
        hash(catalog) === hash(await snapshot(db)) &&
        beforeRows === (await rows()) &&
        beforeShape === hash((await db.unsafe(shapeQuery))[0].value) &&
        beforeExtra === hash(await extra());
      refusals.push({ name, errno: code, preserved });
      if (code !== "55000" || !preserved)
        throw Error("Task8 meaningful refusal failed: " + name + " " + code);
    }
    receipt.refusals = refusals;
    await db.begin(async (tx) => {
      await tx`set local role postgres`;
      await tx.unsafe(source);
    });
    const after = await snapshot(db);
    receipt.onlyTargetsChanged = hash(unaffected(catalog)) === hash(unaffected(after));
    receipt.helpersPreserved =
      hash(beforeHelpers) === hash((await db.unsafe(functionsQuery))[0].value);
    receipt.migrationRowsPreserved = beforeRows === (await rows());
    receipt.migrationExtraPreserved = beforeExtra === hash(await extra());
    await db.begin(async (tx) => {
      await tx`set local role postgres`;
      await tx.unsafe(source);
    });
    receipt.secondApplyPreserved = hash(after) === hash(await snapshot(db));
    const child = Bun.spawn(
      ["bun", "test", "src/lib/volunteers/atomicForward.database.test.ts", "--timeout", "30000"],
      {
        cwd: root,
        env: { ...process.env, R01_VOLUNTEER_TEST_DATABASE_URL: clone.url },
        stdout: "pipe",
        stderr: "pipe",
      },
    );
    const [stdout, stderr, exit] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    await writeFile(resolve(out, "test.log"), stdout + stderr);
    receipt.testExit = exit;
    receipt.testSummary = (stdout + stderr).match(
      /^\s*\d+ (?:pass|fail|skip|expect\(\) calls)\s*$/gm,
    );
    receipt.testsCatalogPreserved = hash(after) === hash(await snapshot(db));
    receipt.testsRowsPreserved = beforeRows === (await rows());
    receipt.testsExtraPreserved = beforeExtra === hash(await extra());
    await writeFile(
      resolve(out, "catalog-after.json"),
      JSON.stringify(await snapshot(db), null, 2) + "\n",
    );
    receipt.finalTargets = (await db.unsafe(targetQuery))[0].value;
    if (exit !== 0) process.exitCode = 1;
  }
} catch (e) {
  receipt.error = { message: (e as Error).message, errno: (e as { errno?: string }).errno };
  process.exitCode = 1;
} finally {
  await clone.close();
  receipt.templatePreserved = clone.templatePreserved;
  receipt.modernPreserved = modernBefore === (await localSourceState(modern));
  receipt.frozenInputsPreserved = hash(frozen) === hash(await blobs());
  receipt.cleanup = "normal owned clone DROP";
  receipt.completedAt = new Date().toISOString();
  if (
    Object.entries(receipt).some(([k, v]) => k.endsWith("Preserved") && v === false) ||
    receipt.onlyTargetsChanged === false
  )
    process.exitCode = 1;
  await writeFile(resolve(out, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
  console.log(
    JSON.stringify({
      mode,
      out,
      testExit: receipt.testExit,
      error: receipt.error,
      preservation: Object.fromEntries(
        Object.entries(receipt).filter(
          ([k]) => k.endsWith("Preserved") || k === "onlyTargetsChanged",
        ),
      ),
    }),
  );
}
