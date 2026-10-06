/** Actual SQL partial-installation admission regression in one new owned clone. */
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  captureModernLocalSchema,
  createProductionClone,
  assertSafeFixtureTables,
  snapshot,
  hash,
  localSourceState,
} from "./productionSchemaClone";
import {
  fixtureScope,
  targetQuery,
  authQuery,
  shapeQuery,
} from "../../../docs/evidence/audit-remediation-20260927/r01-forward/task-8-profile";

const root = resolve(import.meta.dir, "../../.."),
  mode = process.argv[2];
if (process.env.R01_VOLUNTEER_ALLOW_LOCAL_FIXTURES !== "1" || !["red", "green"].includes(mode))
  throw Error("Explicit owned Task8 overload regression mode required");
const migration = "supabase/migrations/20261006163243_r01_volunteer_atomic_forward.sql";
const out = resolve(
  root,
  "docs/evidence/audit-remediation-20260927/r01-forward/task-8-fix-1-receipts",
  mode + "-" + Date.now(),
);
await mkdir(out, { recursive: true });
await writeFile(resolve(out, ".gitattributes"), "* -text\n");
const files = [
  migration,
  "supabase/rls-tests/helpers/runR01VolunteerOverload.ts",
  "supabase/rls-tests/helpers/productionSchemaClone.ts",
  "docs/evidence/audit-remediation-20260927/r01-forward/task-8-profile.ts",
  "docs/evidence/audit-remediation-20260927/r01-forward/task-8-generate.ts",
];
const blobs = async () =>
  Object.fromEntries(
    await Promise.all(files.map(async (p) => [p, hash(await readFile(resolve(root, p), "utf8"))])),
  );
const frozen = await blobs();
for (const [i, p] of files.entries())
  await copyFile(resolve(root, p), resolve(out, `s${String(i).padStart(3, "0")}.source`));
const modern = "postgresql://postgres:postgres@127.0.0.1:57322/postgres",
  modernBefore = await localSourceState(modern);
const clone = await createProductionClone(await captureModernLocalSchema()),
  db = clone.sql;
const source = await readFile(resolve(root, migration), "utf8"),
  forced = Error("Task8 overload regression rollback");
const receipt: Record<string, unknown> = {
  mode,
  at: new Date().toISOString(),
  out,
  clone: clone.name,
  fixtureScope,
  zeroApplicationTables: clone.tableCount,
  schemaParity: true,
  frozenInputs: frozen,
  sourceCommit: (
    await new Response(
      Bun.spawn(["git", "rev-parse", "HEAD"], { cwd: root, stdout: "pipe" }).stdout,
    ).text()
  ).trim(),
};
type OverloadResult = {
  name: string;
  setup: string;
  setupReached: boolean;
  beforeTargets: unknown[];
  afterTargets: unknown[];
  expected: string;
  actual: string;
  preserved: boolean;
};
const state = async () => {
  const rows: unknown[] = [];
  for (const t of await db`select n.nspname||'.'||c.relname name from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname in ('public','private') and c.relkind in ('r','p') union all select 'auth.users' order by 1`) {
    const [r] = await db.unsafe(
      `select count(*)::text count,md5(coalesce(string_agg(to_jsonb(t)::text,E'\\n' order by to_jsonb(t)::text),'')) hash from ${t.name} t`,
    );
    rows.push([t.name, r]);
  }
  return hash({
    catalog: await snapshot(db),
    rows,
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
};
const regsig =
  "uuid,uuid,text,integer,text,text,text,text,text,integer,integer,text,text,text,text,timestamptz,boolean,boolean";
const cases = [
  [
    "clone plus unknown overload, registration absent",
    `drop function public.create_volunteer_registration_idempotent(${regsig});create function public.clone_volunteer_activity_with_audit(uuid) returns uuid language sql as 'select $1'`,
  ],
  [
    "registration plus unknown overload, clone absent",
    "drop function public.clone_volunteer_activity_with_audit(uuid,uuid,timestamptz);create function public.create_volunteer_registration_idempotent(uuid) returns jsonb language sql as 'select null::jsonb'",
  ],
] as const;
try {
  await assertSafeFixtureTables(db, fixtureScope);
  await db.begin(async (tx) => {
    await tx`set local role postgres`;
    await tx`insert into public.volunteer_activity(id,type,title,starts_at,ends_at,location,capacity,status) values('00000000-0000-4000-8000-000000000018','cleaning_day','Synthetic preserved Task8 overload','2000-01-01T00:00:00Z','2000-01-01T03:00:00Z','Owned clone',1,'draft')`;
    await tx`insert into public.audit_log(action,entity,entity_id,detail) values('synthetic.preserved.fix1','task8','preserved','{}'::jsonb)`;
  });
  const baseline = await state();
  receipt.beforeState = baseline;
  const results: OverloadResult[] = [];
  receipt.results = results;
  for (const [name, setup] of cases) {
    let setupReached = false,
      code = "success",
      beforeTargets: unknown[] = [],
      afterTargets: unknown[] = [];
    try {
      await db.begin(async (tx) => {
        await tx`set local role postgres`;
        // Establish recognized tuples through the actual same migration before partial metadata.
        await tx.unsafe(source);
        await tx.unsafe(setup);
        beforeTargets = (await tx.unsafe(targetQuery))[0].value;
        if (beforeTargets.length !== 2) throw Error("Two-tuple partial installation required");
        setupReached = true;
        await tx.unsafe(source);
        afterTargets = (await tx.unsafe(targetQuery))[0].value;
        throw forced;
      });
    } catch (e) {
      if (e !== forced) code = (e as { errno?: string }).errno ?? "unexpected";
    }
    const preserved = baseline === (await state());
    results.push({
      name,
      setup,
      setupReached,
      beforeTargets,
      afterTargets,
      expected: "55000",
      actual: code,
      preserved,
    });
    if (!setupReached || !preserved) throw Error("Overload fixture/rollback failure: " + name);
  }
  if (mode === "red") {
    if (!results.every((r) => r.actual === "success" && r.afterTargets.length === 3))
      throw Error("Actual two-direction overload RED absent");
    receipt.result =
      "actual watched RED: expected55000; success retained three targets in both directions";
    process.exitCode = 1;
  } else {
    if (!results.every((r) => r.actual === "55000"))
      throw Error("Partial-installation refusal failed");
    receipt.result = "GREEN: actual55000 both directions with complete rollback";
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
  if (Object.entries(receipt).some(([k, v]) => k.endsWith("Preserved") && v === false))
    process.exitCode = 1;
  await writeFile(resolve(out, "receipt.json"), JSON.stringify(receipt, null, 2) + "\n");
  console.log(
    JSON.stringify({
      mode,
      out,
      result: receipt.result,
      error: receipt.error,
      results: (receipt.results as OverloadResult[] | undefined)?.map((r) => ({
        name: r.name,
        actual: r.actual,
        setupReached: r.setupReached,
        beforeTargets: r.beforeTargets.length,
        afterTargets: r.actual === "success" ? r.afterTargets.length : null,
        preserved: r.preserved,
      })),
      templatePreserved: receipt.templatePreserved,
      modernPreserved: receipt.modernPreserved,
      frozenInputsPreserved: receipt.frozenInputsPreserved,
    }),
  );
}
